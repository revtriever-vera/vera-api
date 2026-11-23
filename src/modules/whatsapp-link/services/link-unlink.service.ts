import { Injectable } from '@nestjs/common';
import { WhatsAppConversationEraser } from '../../whatsapp/services/whatsapp-conversation-eraser.service';
import { LinkCodeDomain } from '../domain/link-code.domain';
import { LinkDomain } from '../domain/link.domain';
import { UnlinkReason, WhatsAppLink } from '../domain/whatsapp-link.types';
import { PhoneVault } from './phone-vault.service';
import { ReminderCancellationRegistry } from './reminder-cancellation.registry';
import { WhatsAppLinkLogService } from './whatsapp-link-log.service';
import { WhatsAppLinkMetricsService } from './whatsapp-link-metrics.service';

@Injectable()
export class LinkUnlinkService {
    public constructor(
        private readonly links: LinkDomain,
        private readonly codes: LinkCodeDomain,
        private readonly reminders: ReminderCancellationRegistry,
        private readonly conversation: WhatsAppConversationEraser,
        private readonly vault: PhoneVault,
        private readonly logs: WhatsAppLinkLogService,
        private readonly metrics: WhatsAppLinkMetricsService
    ) {}

    public async unlink(link: WhatsAppLink, reason: UnlinkReason): Promise<boolean> {
        if (!(await this.links.markUnlinked(link.id, reason))) {
            return false;
        }
        await this.reminders.cancelForLink(link.id);
        await this.conversation.eraseText(link.companyId, link.id, await this.vault.open(link.phoneSealed, link.companyId));
        this.logs.unlinked(reason);
        this.metrics.unlinked(reason);
        return true;
    }

    public async unlinkUser(userId: string, reason: UnlinkReason): Promise<boolean> {
        await this.codes.cancelPendingOfUser(userId);
        const link: WhatsAppLink | null = await this.links.liveOfUser(userId);
        return link === null ? false : this.unlink(link, reason);
    }

    public async unlinkCompany(reason: UnlinkReason): Promise<number> {
        await this.codes.cancelPendingOfCompany();
        let unlinked: number = 0;
        for (const link of await this.links.listLive()) {
            unlinked += (await this.unlink(link, reason)) ? 1 : 0;
        }
        return unlinked;
    }
}
