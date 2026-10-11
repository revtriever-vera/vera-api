import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from '../../../core/observability/metrics.service';
import { PortfolioMetricsService } from './portfolio-metrics.service';

describe('PortfolioMetricsService', () => {
    it('records the snapshot duration in the histogram', () => {
        const observe = vi.fn();
        new PortfolioMetricsService({ observe } as unknown as MetricsService).snapshotDuration(15);

        expect(observe).toHaveBeenCalledWith('vera_portfolio_snapshot_duration_ms', 15);
    });

    it('counts missing quotes only when there are some', () => {
        const count = vi.fn();
        const service: PortfolioMetricsService = new PortfolioMetricsService({ count } as unknown as MetricsService);

        service.missingQuotes(0);
        service.missingQuotes(2);

        expect(count).toHaveBeenCalledExactlyOnceWith('vera_portfolio_missing_quotes_total', {}, 2);
    });
});
