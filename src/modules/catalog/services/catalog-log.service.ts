import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { CATALOG_SOURCES, CatalogSource, SyncRunOutcome } from '../domain/catalog.types';

export interface FundCatalogCounts {
    readonly classesRead: number;
    readonly classesFiltered: number;
    readonly seriesWithQuota: number;
    readonly seriesWritten: number;
    readonly seriesWithoutQuota: number;
}

const SYNC: string = 'catalog-sync';
const SEARCH: string = 'catalog-search';
const SOURCE: string = 'catalog-source';

@Injectable()
export class CatalogLogService {
    public constructor(private readonly logService: LogService) {}

    public syncFinished(source: CatalogSource, outcome: SyncRunOutcome): void {
        this.logService.info({
            message: 'sync finished',
            identifier: SYNC,
            meta: { source, fetched: outcome.fetched, upserted: outcome.upserted, delisted: outcome.delisted, status: outcome.status }
        });
    }

    public syncSuspicious(source: CatalogSource, fetched: number, previous: number): void {
        this.logService.warn({ message: 'sync skipped as suspicious', identifier: SYNC, meta: { source, fetched, previous } });
    }

    public syncSkippedWithoutDriver(source: CatalogSource): void {
        this.logService.info({ message: 'sync skipped without driver', identifier: SYNC, meta: { source } });
    }

    public sourceFailed(source: CatalogSource, errorCode: string): void {
        this.logService.error({ message: 'source failed', identifier: SOURCE, meta: { source, errorCode } });
    }

    public informeRead(month: string, notModified: boolean, rows: number, durationMs: number): void {
        this.logService.info({
            message: 'daily informe read',
            identifier: SOURCE,
            meta: { source: CATALOG_SOURCES.cvmFunds, month, notModified, rows, durationMs }
        });
    }

    public fundCatalogBuilt(counts: FundCatalogCounts): void {
        this.logService.info({
            message: 'fund catalog built',
            identifier: SOURCE,
            meta: { source: CATALOG_SOURCES.cvmFunds, ...counts }
        });
    }

    public searchFailed(error: unknown): void {
        this.logService.error({ message: 'search failed', identifier: SEARCH, error });
    }

    public invalidPayload(type: string): void {
        this.logService.error({ message: 'invalid payload', identifier: SYNC, meta: { type } });
    }
}
