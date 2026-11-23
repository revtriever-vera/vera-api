import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AppLocale } from '../../../shared/i18n/locale';
import { UserLocaleService } from '../../identity/services/user-locale.service';
import type { WhatsAppChannel } from '../../whatsapp/services/whatsapp-channel.service';
import { channelServes } from '../domain/channel-scope';
import { LinkDomain } from '../domain/link.domain';
import { LINK_STATUSES, ResolvedSender, WhatsAppLink } from '../domain/whatsapp-link.types';
import { PhoneVault } from './phone-vault.service';

@Injectable()
export class LinkResolverService {
    public constructor(
        private readonly links: LinkDomain,
        private readonly vault: PhoneVault,
        private readonly locales: UserLocaleService
    ) {}

    public async resolve(from: string, channel: WhatsAppChannel, now: Date = new Date()): Promise<ResolvedSender | null> {
        const link: WhatsAppLink | null = await this.lookup(from, channel);
        return link === null ? null : this.enter(link.companyId, link, now);
    }

    public async lookup(from: string, channel: WhatsAppChannel): Promise<WhatsAppLink | null> {
        const link: WhatsAppLink | null = await this.links.liveByPhoneHashAcrossTenants(this.vault.hashOf(from));
        return link !== null && channelServes(channel, link.companyId) ? link : null;
    }

    @AsCompany()
    private async enter(_companyId: string, link: WhatsAppLink, now: Date): Promise<ResolvedSender> {
        if (link.status === LINK_STATUSES.suspended) {
            await this.links.reactivate(link.id);
        }
        await this.links.touchInbound(link.id, now);
        const locale: AppLocale = await this.locales.localeOf(link.userId, link.companyId);
        return { linkId: link.id, companyId: link.companyId, userId: link.userId, locale };
    }
}
