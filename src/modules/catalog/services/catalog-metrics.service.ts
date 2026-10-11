import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { ASSET_STATUSES, AssetStatus, CatalogMarket, CatalogSource, SyncRunStatus } from '../domain/catalog.types';

const SYNC_TOTAL: string = 'vera_catalog_sync_total';
const ASSETS: string = 'vera_catalog_assets';

@Injectable()
export class CatalogMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public syncResult(source: CatalogSource, result: SyncRunStatus): void {
        this.metrics.count(SYNC_TOTAL, { source, result });
    }

    public assetCounts(market: CatalogMarket, counts: ReadonlyMap<AssetStatus, number>): void {
        for (const status of Object.values(ASSET_STATUSES)) {
            this.metrics.gauge(ASSETS, counts.get(status) ?? 0, { market, status });
        }
    }
}
