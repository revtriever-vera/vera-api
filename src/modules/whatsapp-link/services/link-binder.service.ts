import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { LinkCodeDomain } from '../domain/link-code.domain';
import { LinkDomain } from '../domain/link.domain';
import { WhatsAppLink, WhatsAppLinkCode } from '../domain/whatsapp-link.types';
import { PhoneVault } from './phone-vault.service';
import { RejectReason, WhatsAppLinkLogService } from './whatsapp-link-log.service';
import { WhatsAppLinkMetricsService } from './whatsapp-link-metrics.service';

export type BindOutcome = { readonly link: WhatsAppLink } | { readonly rejected: RejectReason };

@Injectable()
export class LinkBinder {
    public constructor(
        private readonly links: LinkDomain,
        private readonly codes: LinkCodeDomain,
        private readonly vault: PhoneVault,
        private readonly logs: WhatsAppLinkLogService,
        private readonly metrics: WhatsAppLinkMetricsService
    ) {}

    public async bind(pending: WhatsAppLinkCode, from: string): Promise<BindOutcome> {
        const outcome: BindOutcome = await this.bindInCompany(pending.companyId, pending, from);
        if ('link' in outcome) {
            this.logs.linked(this.vault.hashOf(from));
            this.metrics.code('linked');
        }
        return outcome;
    }

    @AsCompany()
    @UsingTransaction()
    private async bindInCompany(_companyId: string, pending: WhatsAppLinkCode, from: string): Promise<BindOutcome> {
        if (!(await this.codes.consume(pending.id, new Date()))) {
            return { rejected: 'unknown_or_expired' };
        }
        if ((await this.links.liveByPhoneHashAcrossTenants(this.vault.hashOf(from))) !== null) {
            return { rejected: 'phone_in_use' };
        }
        const link: WhatsAppLink | null = await this.links.createActive(
            {
                userId: pending.userId,
                phoneSealed: await this.vault.seal(from, pending.companyId),
                phoneHash: this.vault.hashOf(from),
                phoneLast4: this.vault.last4Of(from)
            },
            new Date()
        );
        return link === null ? { rejected: 'unknown_or_expired' } : { link };
    }
}
