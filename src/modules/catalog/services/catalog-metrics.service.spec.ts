import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from '../../../core/observability/metrics.service';
import { AssetStatus } from '../domain/catalog.types';
import { CatalogMetricsService } from './catalog-metrics.service';

describe('CatalogMetricsService', () => {
    it('counts rounds by source and result', () => {
        const count: ReturnType<typeof vi.fn> = vi.fn();
        const service: CatalogMetricsService = new CatalogMetricsService({ count } as unknown as MetricsService);

        service.syncResult('b3', 'skipped_suspicious');

        expect(count).toHaveBeenCalledWith('vera_catalog_sync_total', { source: 'b3', result: 'skipped_suspicious' });
    });

    it('sets the gauge for every status, zero when absent', () => {
        const gauge: ReturnType<typeof vi.fn> = vi.fn();
        const service: CatalogMetricsService = new CatalogMetricsService({ gauge } as unknown as MetricsService);

        service.assetCounts('B3', new Map<AssetStatus, number>([['active', 7]]));

        expect(gauge).toHaveBeenCalledWith('vera_catalog_assets', 7, { market: 'B3', status: 'active' });
        expect(gauge).toHaveBeenCalledWith('vera_catalog_assets', 0, { market: 'B3', status: 'delisted' });
    });
});
