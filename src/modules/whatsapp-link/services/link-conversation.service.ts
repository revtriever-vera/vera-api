import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { ThrottleService } from '../../../core/throttle/throttle.service';
import { AppLocale } from '../../../shared/i18n/locale';
import type { InboundMessage, WhatsAppChannel } from '../../whatsapp/services/inbound-dispatch.port';
import { WhatsAppDirectReply } from '../../whatsapp/services/whatsapp-direct-reply.service';
import { WhatsAppInboundRecorder } from '../../whatsapp/services/whatsapp-inbound-recorder.service';
import { WhatsAppOutboundService } from '../../whatsapp/services/whatsapp-outbound.service';
import { LINK_COMMAND_WORD } from '../domain/link-message';
import { LinkTexts, linkTextsFor } from '../domain/link-texts';
import { ONE_HOUR_SECONDS, REJECTED_REPLIES_PER_PHONE_PER_HOUR, WhatsAppLink } from '../domain/whatsapp-link.types';
import { PhoneVault } from './phone-vault.service';
import { RejectReason, WhatsAppLinkLogService } from './whatsapp-link-log.service';
import { WhatsAppLinkMetricsService } from './whatsapp-link-metrics.service';

@Injectable()
export class LinkConversationService {
    public constructor(
        private readonly recorder: WhatsAppInboundRecorder,
        private readonly outbound: WhatsAppOutboundService,
        private readonly reply: WhatsAppDirectReply,
        private readonly throttle: ThrottleService,
        private readonly vault: PhoneVault,
        private readonly logs: WhatsAppLinkLogService,
        private readonly metrics: WhatsAppLinkMetricsService
    ) {}

    public async welcome(link: WhatsAppLink, message: InboundMessage, locale: AppLocale): Promise<void> {
        await this.welcomeInCompany(link.companyId, link, message, locale);
    }

    public async reject(channel: WhatsAppChannel, from: string, reason: RejectReason, locale: AppLocale): Promise<void> {
        const hash: string = this.vault.hashOf(from);
        this.logs.codeRejected(reason, hash);
        this.metrics.code('rejected');
        const quiet: boolean = !(await this.throttle.isAllowed(
            `whatsapp-link-reject:${hash}`,
            REJECTED_REPLIES_PER_PHONE_PER_HOUR,
            ONE_HOUR_SECONDS
        ));
        if (!quiet) {
            const texts: LinkTexts = linkTextsFor(locale);
            await this.send(channel, from, reason === 'phone_in_use' ? texts.phoneInUse : texts.invalidCode);
        }
    }

    public async goodbye(channel: WhatsAppChannel, to: string, locale: AppLocale): Promise<void> {
        await this.send(channel, to, linkTextsFor(locale).unlinked);
    }

    @AsCompany()
    private async welcomeInCompany(_companyId: string, link: WhatsAppLink, message: InboundMessage, locale: AppLocale): Promise<void> {
        try {
            await this.recorder.record(link.companyId, { ...message, text: LINK_COMMAND_WORD }, link.id);
            await this.outbound.enqueueText(message.from, linkTextsFor(locale).welcome);
        } catch {
            this.logs.welcomeFailed();
        }
    }

    private async send(channel: WhatsAppChannel, to: string, text: string): Promise<void> {
        if (!(await this.reply.send(channel, to, text))) {
            this.logs.replyFailed();
        }
    }
}
