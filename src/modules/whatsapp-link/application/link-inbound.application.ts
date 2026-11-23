import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { AppLocale, DEFAULT_LOCALE } from '../../../shared/i18n/locale';
import { UserLocaleService } from '../../identity/services/user-locale.service';
import type { InboundMessage, WhatsAppChannel } from '../../whatsapp/services/inbound-dispatch.port';
import { channelServes } from '../domain/channel-scope';
import { LinkCodeDomain } from '../domain/link-code.domain';
import { parseLinkMessage } from '../domain/link-message';
import { parseOptOut } from '../domain/opt-out';
import { UnlinkReason, WhatsAppLink, WhatsAppLinkCode } from '../domain/whatsapp-link.types';
import { BindOutcome, LinkBinder } from '../services/link-binder.service';
import { LinkConversationService } from '../services/link-conversation.service';
import { LinkResolverService } from '../services/link-resolver.service';
import { LinkUnlinkService } from '../services/link-unlink.service';

@Injectable()
export class LinkInboundApplication {
    public constructor(
        private readonly codes: LinkCodeDomain,
        private readonly resolver: LinkResolverService,
        private readonly unlinker: LinkUnlinkService,
        private readonly binder: LinkBinder,
        private readonly conversation: LinkConversationService,
        private readonly locales: UserLocaleService
    ) {}

    public async handle(message: InboundMessage, channel: WhatsAppChannel): Promise<void> {
        if (message.kind !== 'text' || message.text === undefined) {
            return;
        }
        const code: string | null = parseLinkMessage(message.text);
        if (code !== null) {
            await this.link(message, channel, code);
            return;
        }
        const reason: UnlinkReason | null = parseOptOut(message.text);
        if (reason !== null) {
            await this.optOut(message, channel, reason);
        }
    }

    private async link(message: InboundMessage, channel: WhatsAppChannel, code: string): Promise<void> {
        const pending: WhatsAppLinkCode | null = await this.codes.pendingByCodeAcrossTenants(code, new Date());
        if (pending === null || !channelServes(channel, pending.companyId)) {
            await this.conversation.reject(channel, message.from, 'unknown_or_expired', DEFAULT_LOCALE);
            return;
        }
        const locale: AppLocale = await this.localeIn(pending.companyId, pending.userId);
        const bound: BindOutcome = await this.binder.bind(pending, message.from);
        if ('rejected' in bound) {
            await this.conversation.reject(channel, message.from, bound.rejected, locale);
            return;
        }
        await this.conversation.welcome(bound.link, message, locale);
    }

    private async optOut(message: InboundMessage, channel: WhatsAppChannel, reason: UnlinkReason): Promise<void> {
        const link: WhatsAppLink | null = await this.resolver.lookup(message.from, channel);
        if (link === null) {
            return;
        }
        const locale: AppLocale = await this.localeIn(link.companyId, link.userId);
        await this.unlinkInCompany(link.companyId, link, reason);
        await this.conversation.goodbye(channel, message.from, locale);
    }

    @AsCompany()
    @UsingTransaction()
    private async unlinkInCompany(_companyId: string, link: WhatsAppLink, reason: UnlinkReason): Promise<void> {
        await this.unlinker.unlink(link, reason);
    }

    @AsCompany()
    private async localeIn(companyId: string, userId: string): Promise<AppLocale> {
        return this.locales.localeOf(userId, companyId);
    }
}
