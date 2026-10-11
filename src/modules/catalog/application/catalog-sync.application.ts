import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import { DateUtil } from '../../../shared/utils/date.util';
import { buildAssetWrites } from '../domain/asset-snapshot';
import { AssetDomain } from '../domain/asset.domain';
import { CatalogSyncRunDomain } from '../domain/catalog-sync-run.domain';
import { CatalogSourceError } from '../domain/catalog.errors';
import {
    AssetStatus,
    AssetWrite,
    CATALOG_SOURCES,
    CatalogMarket,
    CatalogSource,
    CatalogSyncRun,
    MARKET_BY_SOURCE,
    SOURCES_BY_CADENCE,
    SUSPICIOUS_DROP_RATIO,
    SYNC_RUN_STATUSES,
    SnapshotResult,
    StatusCount,
    SyncCadence,
    SyncRunOutcome,
    SOURCE_ERROR_CODES
} from '../domain/catalog.types';
import { AssetSourcePort, SourceAsset } from '../ports/asset-source.port';
import { AssetSourceRegistryService } from '../services/asset-source-registry.service';
import { CatalogLogService } from '../services/catalog-log.service';
import { CatalogMetricsService } from '../services/catalog-metrics.service';
import { SyncSourcePayload, SyncTickPayload, syncSourcePayloadSchema, syncTickPayloadSchema } from '../validation/catalog.schemas';

function failedOutcome(errorCode: string): SyncRunOutcome {
    return { status: SYNC_RUN_STATUSES.failed, fetched: 0, upserted: 0, delisted: 0, errorCode };
}

function errorCodeOf(error: unknown): string {
    return error instanceof CatalogSourceError ? error.errorCode : SOURCE_ERROR_CODES.unexpected;
}

@Injectable()
export class CatalogSyncApplication {
    public constructor(
        private readonly assets: AssetDomain,
        private readonly runs: CatalogSyncRunDomain,
        private readonly registry: AssetSourceRegistryService,
        private readonly publisher: QueuePublisherPort,
        private readonly logs: CatalogLogService,
        private readonly metrics: CatalogMetricsService
    ) {}

    public async handleTick(payload: unknown): Promise<void> {
        const parsed: z.SafeParseReturnType<unknown, SyncTickPayload> = syncTickPayloadSchema.safeParse(payload);
        if (!parsed.success) {
            this.logs.invalidPayload(MESSAGE_TYPES.catalogSyncTickRequested);
            return;
        }
        await this.fanOut(parsed.data.cadence);
    }

    public async handleSource(payload: unknown): Promise<void> {
        const parsed: z.SafeParseReturnType<unknown, SyncSourcePayload> = syncSourcePayloadSchema.safeParse(payload);
        if (!parsed.success) {
            this.logs.invalidPayload(MESSAGE_TYPES.catalogSyncSourceRequested);
            return;
        }
        await this.runSource(parsed.data.source);
    }

    public async fanOut(cadence?: SyncCadence): Promise<CatalogSource[]> {
        const wanted: readonly CatalogSource[] = cadence === undefined ? Object.values(CATALOG_SOURCES) : SOURCES_BY_CADENCE[cadence];
        const available: ReadonlySet<CatalogSource> = new Set<CatalogSource>(this.registry.available());
        const day: string = DateUtil.todayInBrazil();
        const published: CatalogSource[] = [];
        for (const source of wanted) {
            if (!available.has(source)) {
                this.logs.syncSkippedWithoutDriver(source);
                continue;
            }
            await this.publisher.publish(
                QUEUES.catalog,
                MESSAGE_TYPES.catalogSyncSourceRequested,
                { source },
                { jobId: `catalog-sync-${source}-${day}` }
            );
            published.push(source);
        }
        return published;
    }

    public async syncAllNow(): Promise<void> {
        for (const source of this.registry.available()) {
            await this.runSource(source);
        }
    }

    public async runSource(source: CatalogSource): Promise<SyncRunOutcome | null> {
        const port: AssetSourcePort | null = this.registry.portFor(source);
        if (port === null) {
            this.logs.syncSkippedWithoutDriver(source);
            return null;
        }
        const startedAt: Date = new Date();
        const run: CatalogSyncRun = await this.runs.start(source, startedAt);
        try {
            const outcome: SyncRunOutcome = await this.synchronize(port, source, startedAt);
            await this.close(run, source, outcome);
            return outcome;
        } catch (error: unknown) {
            return this.fail(run, source, error);
        }
    }

    private async synchronize(port: AssetSourcePort, source: CatalogSource, startedAt: Date): Promise<SyncRunOutcome> {
        const market: CatalogMarket = MARKET_BY_SOURCE[source];
        const fetched: readonly SourceAsset[] = await port.fetchAll();
        const writes: AssetWrite[] = buildAssetWrites(market, fetched);
        const previous: number | null = await this.runs.lastSucceededFetched(source);
        if (previous !== null && writes.length < previous * SUSPICIOUS_DROP_RATIO) {
            this.logs.syncSuspicious(source, writes.length, previous);
            return { status: SYNC_RUN_STATUSES.skippedSuspicious, fetched: writes.length, upserted: 0, delisted: 0, errorCode: null };
        }
        if (writes.length === 0) {
            throw new CatalogSourceError(SOURCE_ERROR_CODES.formatInvalid);
        }
        const result: SnapshotResult = await this.persist(market, writes, startedAt);
        return { status: SYNC_RUN_STATUSES.succeeded, fetched: writes.length, ...result, errorCode: null };
    }

    @UsingTransaction()
    private async persist(market: CatalogMarket, writes: readonly AssetWrite[], startedAt: Date): Promise<SnapshotResult> {
        return this.assets.applySnapshot(market, writes, startedAt);
    }

    private async close(run: CatalogSyncRun, source: CatalogSource, outcome: SyncRunOutcome): Promise<void> {
        await this.runs.finish(run.id, outcome);
        this.logs.syncFinished(source, outcome);
        this.metrics.syncResult(source, outcome.status);
        await this.refreshGauge(MARKET_BY_SOURCE[source]);
    }

    private async fail(run: CatalogSyncRun, source: CatalogSource, error: unknown): Promise<SyncRunOutcome | null> {
        const errorCode: string = errorCodeOf(error);
        const outcome: SyncRunOutcome = failedOutcome(errorCode);
        await this.runs.finish(run.id, outcome);
        this.logs.sourceFailed(source, errorCode);
        this.metrics.syncResult(source, SYNC_RUN_STATUSES.failed);
        if (error instanceof CatalogSourceError && !error.retryable) {
            return outcome;
        }
        throw error;
    }

    private async refreshGauge(market: CatalogMarket): Promise<void> {
        const counts: StatusCount[] = await this.assets.countByStatus(market);
        const byStatus: ReadonlyMap<AssetStatus, number> = new Map<AssetStatus, number>(
            counts.map((count: StatusCount): [AssetStatus, number] => [count.status, count.total])
        );
        this.metrics.assetCounts(market, byStatus);
    }
}
