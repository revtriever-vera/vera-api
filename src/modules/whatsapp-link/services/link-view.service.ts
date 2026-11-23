import { Injectable } from '@nestjs/common';
import { AiConsentService } from '../../ai-assistant/services/ai-consent.service';
import type { WhatsAppChannel } from '../../whatsapp/services/whatsapp-channel.service';
import { WhatsAppDisplayNumber } from '../../whatsapp/services/whatsapp-display-number.service';
import { LinkCodeDomain } from '../domain/link-code.domain';
import { LinkDomain } from '../domain/link.domain';
import { LINK_STATUSES, UnlinkReason, ViewStatus, WhatsAppLink, WhatsAppLinkCode } from '../domain/whatsapp-link.types';
import { LinkView } from '../validation/link.schemas';
import { PhoneVault } from './phone-vault.service';

@Injectable()
export class LinkViewService {
    public constructor(
        private readonly links: LinkDomain,
        private readonly codes: LinkCodeDomain,
        private readonly displayNumber: WhatsAppDisplayNumber,
        private readonly consent: AiConsentService,
        private readonly vault: PhoneVault
    ) {}

    public async build(userId: string, channel: WhatsAppChannel): Promise<LinkView> {
        const live: WhatsAppLink | null = await this.links.liveOfUser(userId);
        const pending: WhatsAppLinkCode | null = live === null ? await this.codes.pendingOfUser(userId, new Date()) : null;
        return {
            status: statusOf(live, pending),
            phone: live === null ? null : `+${await this.vault.open(live.phoneSealed, live.companyId)}`,
            linkedAt: live?.linkedAt.toISOString() ?? null,
            veraNumber: await this.displayNumber.digitsOf(channel),
            pending: pending === null ? null : { expiresAt: pending.expiresAt.toISOString() },
            lastUnlinkReason: live === null ? await this.lastReasonOf(userId) : null,
            consentRequired: !(await this.consent.isGranted())
        };
    }

    private async lastReasonOf(userId: string): Promise<UnlinkReason | null> {
        const latest: WhatsAppLink | null = await this.links.latestOfUser(userId);
        return (latest?.unlinkReason as UnlinkReason | null | undefined) ?? null;
    }
}

function statusOf(live: WhatsAppLink | null, pending: WhatsAppLinkCode | null): ViewStatus {
    if (live !== null) {
        return live.status === LINK_STATUSES.suspended ? 'suspended' : 'active';
    }
    return pending === null ? 'none' : 'pending';
}
