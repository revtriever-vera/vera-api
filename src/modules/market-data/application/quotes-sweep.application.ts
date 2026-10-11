import { Injectable } from '@nestjs/common';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import { DateUtil } from '../../../shared/utils/date.util';
import { HashUtil } from '../../../shared/utils/hash.util';
import { AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { AssetQuoteDomain } from '../domain/asset-quote.domain';
import { QuotableAsset, QuoteGroup, QuoteMarket, QuoteRecord, SWEEP_GROUPS } from '../domain/market-data.types';
import { isQuoteStale } from '../domain/quote-staleness';
import { HeldAssetsService } from '../services/held-assets.service';
import { MarketDataLogService } from '../services/market-data-log.service';
import { MarketDataMetricsService } from '../services/market-data-metrics.service';
import { ProviderBudgetService } from '../services/provider-budget.service';
import { QuoteProviderRegistryService } from '../services/quote-provider-registry.service';

const JOB_HASH_LENGTH: number = 20;

interface ChunkJob {
    readonly group: QuoteGroup;
    readonly assetIds: string[];
    readonly delayMs: number;
}

function chunksOf<T>(items: readonly T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(items.length / size) }, (_unused: unknown, index: number) =>
        items.slice(index * size, (index + 1) * size)
    );
}

@Injectable()
export class QuotesSweepApplication {
    public constructor(
        private readonly held: HeldAssetsService,
        private readonly catalog: AssetCatalogService,
        private readonly registry: QuoteProviderRegistryService,
        private readonly publisher: QueuePublisherPort,
        private readonly budget: ProviderBudgetService,
        private readonly quotes: AssetQuoteDomain,
        private readonly metrics: MarketDataMetricsService,
        private readonly logs: MarketDataLogService
    ) {}

    public async handleTick(): Promise<number> {
        const heldIds: string[] = await this.held.listHeldAssetIds();
        const assets: QuotableAsset[] = await this.catalog.findManyByIds(heldIds);
        const jobs: ChunkJob[] = SWEEP_GROUPS.flatMap((group: QuoteGroup): ChunkJob[] => this.jobsOf(group, assets));
        const day: string = DateUtil.todayInBrazil();
        for (const job of jobs) {
            await this.publish(job, day);
        }
        await this.budget.pruneOldUsage();
        await this.refreshStaleGauge(assets);
        this.logs.sweepFinished(heldIds.length, jobs.length);
        return jobs.length;
    }

    private jobsOf(group: QuoteGroup, assets: readonly QuotableAsset[]): ChunkJob[] {
        const ids: string[] = assets
            .filter((asset: QuotableAsset): boolean => asset.quotesProvider === group)
            .map((asset: QuotableAsset): string => asset.id)
            .sort();
        const size: number = this.registry.chunkSizeOf(group);
        if (ids.length === 0 || size === 0) {
            return [];
        }
        const spacing: number = this.registry.chunkSpacingMs(group);
        return chunksOf(ids, size).map((assetIds: string[], index: number): ChunkJob => ({ group, assetIds, delayMs: index * spacing }));
    }

    private async publish(job: ChunkJob, day: string): Promise<void> {
        const hash: string = HashUtil.sha256(job.assetIds.join(',')).slice(0, JOB_HASH_LENGTH);
        await this.publisher.publish(
            QUEUES.marketData,
            MESSAGE_TYPES.marketDataQuotesChunkRequested,
            { provider: job.group, assetIds: job.assetIds },
            { jobId: `quotes-chunk-${day}-${job.group}-${hash}`, delayMs: job.delayMs }
        );
    }

    private async refreshStaleGauge(assets: readonly QuotableAsset[]): Promise<void> {
        const records: QuoteRecord[] = await this.quotes.findByAssetIds(assets.map((asset: QuotableAsset): string => asset.id));
        const dateById: ReadonlyMap<string, string> = new Map<string, string>(
            records.map((record: QuoteRecord): [string, string] => [record.assetId, record.priceDate])
        );
        const today: string = DateUtil.todayInBrazil();
        const stale: number = assets.filter((asset: QuotableAsset): boolean => {
            const priceDate: string | undefined = dateById.get(asset.id);
            return priceDate === undefined || isQuoteStale(priceDate, asset.market as QuoteMarket, today);
        }).length;
        this.metrics.staleAssets(stale);
    }
}
