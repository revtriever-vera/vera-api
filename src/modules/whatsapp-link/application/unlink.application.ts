import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AppContext } from '../../../core/context/app-context.port';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { whatsappLinkConfig } from '../config/whatsapp-link.config';
import { LinkDomain } from '../domain/link.domain';
import { LINK_STATUSES, STALE_BATCH, StaleLinkRef, StatusCount, UNLINK_REASONS, WhatsAppLink } from '../domain/whatsapp-link.types';
import { LinkUnlinkService } from '../services/link-unlink.service';
import { WhatsAppLinkMetricsService } from '../services/whatsapp-link-metrics.service';

const DAY_MS: number = 86_400_000;

@Injectable()
export class UnlinkApplication {
    public constructor(
        private readonly links: LinkDomain,
        private readonly unlinker: LinkUnlinkService,
        private readonly metrics: WhatsAppLinkMetricsService,
        private readonly context: AppContext,
        @Inject(whatsappLinkConfig.KEY) private readonly config: ConfigType<typeof whatsappLinkConfig>
    ) {}

    @UsingTransaction()
    public async unlink(): Promise<void> {
        await this.unlinker.unlinkUser(this.context.get().userId ?? '', UNLINK_REASONS.userApp);
    }

    public async unlinkStale(now: Date = new Date()): Promise<number> {
        const cutoff: Date = new Date(now.getTime() - this.config.WHATSAPP_LINK_STALE_DAYS * DAY_MS);
        let total: number = 0;
        let batch: StaleLinkRef[] = await this.links.staleAcrossTenants(cutoff, STALE_BATCH);
        while (batch.length > 0) {
            total += await this.unlinkBatch(batch);
            batch = batch.length < STALE_BATCH ? [] : await this.links.staleAcrossTenants(cutoff, STALE_BATCH);
        }
        await this.publishGauge();
        return total;
    }

    private async unlinkBatch(batch: readonly StaleLinkRef[]): Promise<number> {
        let unlinked: number = 0;
        for (const ref of batch) {
            unlinked += (await this.unlinkOne(ref.companyId, ref.id)) ? 1 : 0;
        }
        return unlinked;
    }

    @AsCompany()
    @UsingTransaction()
    private async unlinkOne(_companyId: string, linkId: string): Promise<boolean> {
        const link: WhatsAppLink | null = await this.links.byId(linkId);
        return link === null ? false : this.unlinker.unlink(link, UNLINK_REASONS.stale);
    }

    private async publishGauge(): Promise<void> {
        const counts: Map<string, number> = new Map<string, number>(
            (await this.links.countByStatusAcrossTenants()).map((entry: StatusCount): [string, number] => [entry.status, entry.total])
        );
        for (const status of Object.values(LINK_STATUSES)) {
            this.metrics.links(status, counts.get(status) ?? 0);
        }
    }
}
