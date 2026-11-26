import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import { compareCodeUnits } from '../../../shared/utils/compare-code-units';
import { DateUtil } from '../../../shared/utils/date.util';
import { HashUtil } from '../../../shared/utils/hash.util';
import { HeldAssetsService } from '../../market-data/services/held-assets.service';
import { portfolioEventsConfig } from '../config/portfolio-events.config';
import { AssetIssuerLinkDomain } from '../domain/asset-issuer-link.domain';
import { EventSource, IssuerLink } from '../domain/portfolio-events.types';
import { PortfolioEventSourcePort } from '../ports/portfolio-event-source.port';
import { PortfolioEventSourceRegistryService } from '../services/portfolio-event-source-registry.service';
import { PortfolioEventsLogService } from '../services/portfolio-events-log.service';
import { PortfolioEventsMetricsService } from '../services/portfolio-events-metrics.service';

const JOB_HASH_LENGTH: number = 20;

interface BatchJob {
    readonly source: EventSource;
    readonly assetIds: string[];
    readonly delayMs: number;
}

function chunksOf<T>(items: readonly T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(items.length / size) }, (_unused: unknown, index: number) =>
        items.slice(index * size, (index + 1) * size)
    );
}

@Injectable()
export class PortfolioEventsSweepApplication {
    public constructor(
        @Inject(portfolioEventsConfig.KEY) private readonly config: ConfigType<typeof portfolioEventsConfig>,
        private readonly held: HeldAssetsService,
        private readonly links: AssetIssuerLinkDomain,
        private readonly registry: PortfolioEventSourceRegistryService,
        private readonly publisher: QueuePublisherPort,
        private readonly metrics: PortfolioEventsMetricsService,
        private readonly logs: PortfolioEventsLogService
    ) {}

    public async handleTick(): Promise<number> {
        const heldIds: string[] = await this.held.listHeldAssetIds();
        const linked: IssuerLink[] = await this.links.findByAssetIds(heldIds);
        const jobs: BatchJob[] = this.registry
            .enabled()
            .flatMap((source: PortfolioEventSourcePort): BatchJob[] => this.jobsOf(source, linked));
        const day: string = DateUtil.todayInBrazil();
        for (const job of jobs) {
            await this.publish(job, day);
        }
        this.metrics.unlinkedAssets(heldIds.length - linked.length);
        this.logs.sweepFinished(heldIds.length, heldIds.length - linked.length, jobs.length);
        return jobs.length;
    }

    private jobsOf(port: PortfolioEventSourcePort, linked: readonly IssuerLink[]): BatchJob[] {
        const ids: string[] = linked
            .filter((link: IssuerLink): boolean => port.handles(link))
            .map((link: IssuerLink): string => link.assetId)
            .sort(compareCodeUnits);
        const spacing: number = this.config.PORTFOLIO_EVENTS_BATCH_SPACING_MS;
        return chunksOf(ids, this.config.PORTFOLIO_EVENTS_BATCH_SIZE).map((assetIds: string[], index: number): BatchJob => ({
            source: port.source,
            assetIds,
            delayMs: index * spacing
        }));
    }

    private async publish(job: BatchJob, day: string): Promise<void> {
        const hash: string = HashUtil.sha256(job.assetIds.join(',')).slice(0, JOB_HASH_LENGTH);
        await this.publisher.publish(
            QUEUES.portfolioEvents,
            MESSAGE_TYPES.portfolioEventsBatchRequested,
            { source: job.source, assetIds: job.assetIds },
            { jobId: `portfolio-events-batch-${day}-${job.source}-${hash}`, delayMs: job.delayMs }
        );
    }
}
