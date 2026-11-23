import { Injectable } from '@nestjs/common';
import { DEFAULT_LOCALE } from '../../../shared/i18n/locale';
import type { InboundMessage, WhatsAppChannel } from '../../whatsapp/services/inbound-dispatch.port';
import { WhatsAppInboundRecorder } from '../../whatsapp/services/whatsapp-inbound-recorder.service';
import type { ResolvedSender } from '../../whatsapp-link/services/link-resolver.service';
import { LinkCommandMatcher } from '../../whatsapp-link/services/link-command-matcher.service';
import { LinkResolverService } from '../../whatsapp-link/services/link-resolver.service';
import { CHAT_ROUTES } from '../domain/whatsapp-chat.types';
import { ChatReplier } from './chat-replier.service';
import { ChatTelemetry } from './chat-telemetry.service';

@Injectable()
export class ChatIntakeService {
    public constructor(
        private readonly matcher: LinkCommandMatcher,
        private readonly resolver: LinkResolverService,
        private readonly recorder: WhatsAppInboundRecorder,
        private readonly replier: ChatReplier,
        private readonly telemetry: ChatTelemetry
    ) {}

    public async admit(message: InboundMessage, channel: WhatsAppChannel): Promise<ResolvedSender | null> {
        if (message.kind === 'text' && this.matcher.isLinkCommand(message.text ?? '')) {
            return null;
        }
        const sender: ResolvedSender | null = await this.resolver.resolve(message.from, channel);
        if (sender === null) {
            await this.replier.unlinkedNotice(channel, message.from, DEFAULT_LOCALE);
            this.telemetry.routed(CHAT_ROUTES.unlinked, null, null);
            return null;
        }
        return (await this.recordedOnce(sender, message, channel)) ? sender : null;
    }

    public async release(sender: ResolvedSender, wamid: string, channel: WhatsAppChannel): Promise<void> {
        if (channel.companyId === null) {
            await this.recorder.discard(sender.companyId, wamid);
        }
    }

    private async recordedOnce(sender: ResolvedSender, message: InboundMessage, channel: WhatsAppChannel): Promise<boolean> {
        return channel.companyId !== null || this.recorder.record(sender.companyId, message, sender.linkId);
    }
}
