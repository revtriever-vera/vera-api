import { Injectable } from '@nestjs/common';
import { AppLocale } from '../../../shared/i18n/locale';
import { DateUtil } from '../../../shared/utils/date.util';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import type { WhatsAppChannel } from '../../whatsapp/services/inbound-dispatch.port';
import { WhatsAppDirectReply } from '../../whatsapp/services/whatsapp-direct-reply.service';
import { WhatsAppOutboundService } from '../../whatsapp/services/whatsapp-outbound.service';
import { PhoneVault } from '../../whatsapp-link/services/phone-vault.service';
import { buttonIdOf, BUTTON_PREFIXES } from '../domain/button-id';
import { chatTextsFor, ChatTexts, pausedText } from '../domain/fixed-replies';
import { ChatLimitsService } from './chat-limits.service';

@Injectable()
export class ChatReplier {
    public constructor(
        private readonly outbound: WhatsAppOutboundService,
        private readonly direct: WhatsAppDirectReply,
        private readonly limits: ChatLimitsService,
        private readonly timezones: CompanyTimezoneService,
        private readonly vault: PhoneVault
    ) {}

    public async text(peer: string, body: string): Promise<void> {
        await this.outbound.enqueueText(peer, body);
    }

    public async confirmation(peer: string, summary: string, pendingId: string, locale: AppLocale): Promise<void> {
        const texts: ChatTexts = chatTextsFor(locale);
        await this.outbound.enqueueInteractive(peer, {
            body: summary,
            choices: [
                { id: buttonIdOf(BUTTON_PREFIXES.action, 'yes', pendingId), title: texts.confirmLabel },
                { id: buttonIdOf(BUTTON_PREFIXES.action, 'no', pendingId), title: texts.cancelLabel }
            ]
        });
    }

    public async markRead(channel: WhatsAppChannel, wamid: string): Promise<void> {
        await this.direct.markRead(channel, wamid);
    }

    public async directText(channel: WhatsAppChannel, peer: string, body: string): Promise<void> {
        await this.direct.send(channel, peer, body);
    }

    public async unlinkedNotice(channel: WhatsAppChannel, from: string, locale: AppLocale): Promise<boolean> {
        if (!(await this.limits.firstToday(`wa-chat-unlinked:${this.vault.hashOf(from)}`))) {
            return false;
        }
        await this.direct.send(channel, from, chatTextsFor(locale).unlinked);
        return true;
    }

    public async pausedNotice(peer: string, linkId: string, locale: AppLocale, resetsAt: string | null): Promise<boolean> {
        if (!(await this.limits.firstToday(`wa-chat-paused:${linkId}`))) {
            return false;
        }
        await this.outbound.enqueueText(peer, await this.pausedBody(locale, resetsAt));
        return true;
    }

    public async pausedBody(locale: AppLocale, resetsAt: string | null): Promise<string> {
        return pausedText(locale, await this.monthOf(resetsAt, locale));
    }

    private async monthOf(resetsAt: string | null, locale: AppLocale): Promise<string> {
        const timeZone: string = await this.timezones.timezoneOfCompany();
        const at: Date = resetsAt === null ? DateUtil.startOfNextMonthIn(timeZone, new Date()) : new Date(resetsAt);
        return new Intl.DateTimeFormat(locale, { month: 'long', timeZone }).format(at);
    }
}
