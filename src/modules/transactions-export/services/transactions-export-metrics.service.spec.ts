import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from '../../../core/observability/metrics.service';
import { TransactionsExportMetricsService } from './transactions-export-metrics.service';

describe('TransactionsExportMetricsService', () => {
    it('counts exports by format and result', () => {
        const count = vi.fn();
        const service: TransactionsExportMetricsService = new TransactionsExportMetricsService({ count } as unknown as MetricsService);

        service.exported('xlsx', 'too_large');

        expect(count).toHaveBeenCalledWith('vera_transactions_export_total', { format: 'xlsx', result: 'too_large' });
    });
});
