import { Injectable } from '@nestjs/common';
import { AppLocale } from '../../../shared/i18n/locale';
import { UserLocaleService } from '../../identity/services/user-locale.service';
import { LinkDomain } from '../domain/link.domain';
import { LINK_STATUSES, WhatsAppLink } from '../domain/whatsapp-link.types';
import { PhoneVault } from './phone-vault.service';

export type LinkContact = {
    readonly linkId: string;
    readonly peer: string;
    readonly locale: AppLocale;
};

@Injectable()
export class LinkContactService {
    public constructor(
        private readonly links: LinkDomain,
        private readonly vault: PhoneVault,
        private readonly locales: UserLocaleService
    ) {}

    public async liveLinkIdOfUser(userId: string): Promise<string | null> {
        return (await this.links.liveOfUser(userId))?.id ?? null;
    }

    public async contactOf(linkId: string): Promise<LinkContact | null> {
        const link: WhatsAppLink | null = await this.links.byId(linkId);
        if (link === null || link.status === LINK_STATUSES.unlinked) {
            return null;
        }
        return {
            linkId: link.id,
            peer: await this.vault.open(link.phoneSealed, link.companyId),
            locale: await this.locales.localeOf(link.userId, link.companyId)
        };
    }
}
