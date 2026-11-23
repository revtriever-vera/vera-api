import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import type { InboundMessage, WhatsAppChannel } from '../../whatsapp/services/inbound-dispatch.port';
import type { ResolvedSender } from '../../whatsapp-link/services/link-resolver.service';
import { LinkUnlinkService } from '../../whatsapp-link/services/link-unlink.service';
import { pixRefusalText } from '../../ai-assistant/services/ask-vera.service';
import { ChatRoute, RouterFacts, routeOf } from '../domain/conversation-router';
import { chatTextsFor, ChatTexts } from '../domain/fixed-replies';
import { CHAT_ROUTES } from '../domain/whatsapp-chat.types';
import { ChatContextRunner } from '../services/chat-context.runner';
import { ChatFactsService } from '../services/chat-facts.service';
import { ChatInteractionsService } from '../services/chat-interactions.service';
import { ChatIntakeService } from '../services/chat-intake.service';
import { ChatReplier } from '../services/chat-replier.service';
import { ChatTelemetry } from '../services/chat-telemetry.service';
import { ChatTurnScheduler, ScheduleOutcome } from '../services/chat-turn.scheduler';

type Exchange = {
    readonly sender: ResolvedSender;
    readonly message: InboundMessage;
    readonly channel: WhatsAppChannel;
};

@Injectable()
export class ConversationApplication {
    public constructor(
        private readonly intake: ChatIntakeService,
        private readonly runner: ChatContextRunner,
        private readonly replier: ChatReplier,
        private readonly facts: ChatFactsService,
        private readonly interactions: ChatInteractionsService,
        private readonly scheduler: ChatTurnScheduler,
        private readonly unlinker: LinkUnlinkService,
        private readonly telemetry: ChatTelemetry
    ) {}

    public async handle(message: InboundMessage, channel: WhatsAppChannel): Promise<void> {
        const sender: ResolvedSender | null = await this.intake.admit(message, channel);
        if (sender === null) {
            return;
        }
        try {
            await this.runner.as(sender, async () => this.serve({ sender, message, channel }));
        } catch (error: unknown) {
            await this.intake.release(sender, message.wamid, channel);
            throw error;
        }
    }

    private async serve(exchange: Exchange): Promise<void> {
        const started: number = Date.now();
        const { sender, message, channel } = exchange;
        await this.replier.markRead(channel, message.wamid);
        const facts: RouterFacts = await this.facts.of(message, sender.linkId);
        const route: ChatRoute = routeOf(facts);
        const queued: boolean = await this.perform(route, exchange);
        this.telemetry.routed(route.name, sender.linkId, queued ? null : Date.now() - started);
    }

    private async perform(route: ChatRoute, exchange: Exchange): Promise<boolean> {
        const { sender, message } = exchange;
        const texts: ChatTexts = chatTextsFor(sender.locale);
        const fixed: Readonly<Record<string, string>> = {
            [CHAT_ROUTES.unsupported]: texts.unsupported,
            [CHAT_ROUTES.help]: texts.help,
            [CHAT_ROUTES.noConsent]: texts.noConsent,
            [CHAT_ROUTES.pixRefusal]: pixRefusalText(sender.locale)
        };
        const reply: string | undefined = fixed[route.name];
        if (reply !== undefined) {
            await this.replier.text(message.from, reply);
            return false;
        }
        return this.performDynamic(route, exchange);
    }

    private async performDynamic(route: ChatRoute, exchange: Exchange): Promise<boolean> {
        const { sender, message } = exchange;
        if (route.name === CHAT_ROUTES.ask) {
            return this.ask(exchange);
        }
        if (route.name === CHAT_ROUTES.premiumRequired) {
            await this.premiumEnded(exchange);
            return false;
        }
        if (route.name === CHAT_ROUTES.paused) {
            await this.replier.pausedNotice(message.from, sender.linkId, sender.locale, await this.facts.resetsAt());
            return false;
        }
        const text: string | null = await this.interact(route, exchange);
        if (text !== null) {
            await this.replier.text(message.from, text);
        }
        return false;
    }

    private async interact(route: ChatRoute, exchange: Exchange): Promise<string | null> {
        const { sender, message } = exchange;
        if (route.name === CHAT_ROUTES.button) {
            return this.interactions.button(sender.linkId, message, sender.locale);
        }
        if (route.name === CHAT_ROUTES.typedConfirmation) {
            return this.interactions.typed(sender.linkId, route.tap, sender.locale);
        }
        return route.name === CHAT_ROUTES.reminderCommand ? this.interactions.reminder(route.command, sender.locale) : null;
    }

    private async ask(exchange: Exchange): Promise<boolean> {
        const { sender, message } = exchange;
        const outcome: ScheduleOutcome = await this.scheduler.schedule(sender.linkId, message);
        if (outcome.state === 'queued') {
            return true;
        }
        if (outcome.state === 'cap_reached') {
            await this.replier.pausedNotice(message.from, sender.linkId, sender.locale, outcome.resetsAt);
            return false;
        }
        this.telemetry.limited();
        if (outcome.notice) {
            await this.replier.text(message.from, chatTextsFor(sender.locale).limited);
        }
        return false;
    }

    private async premiumEnded(exchange: Exchange): Promise<void> {
        const { sender, message, channel } = exchange;
        await this.replier.directText(channel, message.from, chatTextsFor(sender.locale).premiumEnded);
        await this.unlink(sender.linkId);
    }

    @UsingTransaction()
    private async unlink(linkId: string): Promise<void> {
        await this.unlinker.unlinkPremiumEnded(linkId);
    }
}
