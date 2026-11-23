import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { AiConsentService } from '../../ai-assistant/services/ai-consent.service';
import type { WhatsAppChannel } from '../../whatsapp/services/whatsapp-channel.service';
import { WhatsAppChannelService } from '../../whatsapp/services/whatsapp-channel.service';
import { LinkDomain } from '../domain/link.domain';
import { WhatsAppAlreadyLinkedError, WhatsAppConsentRequiredError } from '../domain/whatsapp-link.errors';
import { LinkCodeIssuer } from '../services/link-code-issuer.service';
import { LinkViewService } from '../services/link-view.service';
import { WhatsAppLinkLogService } from '../services/whatsapp-link-log.service';
import { WhatsAppLinkMetricsService } from '../services/whatsapp-link-metrics.service';
import { IssueCodeRequest, IssuedCode, LinkView } from '../validation/link.schemas';

@Injectable()
export class LinkCodeApplication {
    public constructor(
        private readonly links: LinkDomain,
        private readonly issuer: LinkCodeIssuer,
        private readonly views: LinkViewService,
        private readonly channels: WhatsAppChannelService,
        private readonly consent: AiConsentService,
        private readonly context: AppContext,
        private readonly logs: WhatsAppLinkLogService,
        private readonly metrics: WhatsAppLinkMetricsService
    ) {}

    public async issue(request: IssueCodeRequest): Promise<IssuedCode> {
        const channel: WhatsAppChannel = await this.channels.require();
        const userId: string = this.userId();
        await this.issuer.allow(userId);
        if ((await this.links.liveOfUser(userId)) !== null) {
            throw new WhatsAppAlreadyLinkedError();
        }
        await this.ensureConsent(request.consent === true);
        const issued: IssuedCode = await this.issuer.issue(userId, channel);
        this.logs.codeIssued();
        this.metrics.code('issued');
        return issued;
    }

    public async view(): Promise<LinkView> {
        return this.views.build(this.userId(), await this.channels.require());
    }

    private async ensureConsent(accepted: boolean): Promise<void> {
        if (await this.consent.isGranted()) {
            return;
        }
        if (!accepted) {
            throw new WhatsAppConsentRequiredError();
        }
        await this.consent.accept({ source: 'whatsapp_link' });
    }

    private userId(): string {
        return this.context.get().userId ?? '';
    }
}
