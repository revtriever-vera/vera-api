import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from '../../../core/observability/metrics.service';
import { PortfolioExportMetricsService } from './portfolio-export-metrics.service';

describe('PortfolioExportMetricsService', () => {
    it('counts the export by format', () => {
        const count = vi.fn();
        const service: PortfolioExportMetricsService = new PortfolioExportMetricsService({ count } as unknown as MetricsService);

        service.exported('xlsx');

        expect(count).toHaveBeenCalledWith('vera_portfolio_exports_total', { format: 'xlsx' });
    });
});
