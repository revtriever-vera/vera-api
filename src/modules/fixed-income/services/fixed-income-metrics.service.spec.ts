import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from '../../../core/observability/metrics.service';
import { FixedIncomeMetricsService } from './fixed-income-metrics.service';

describe('FixedIncomeMetricsService', () => {
    it('emite as três métricas do módulo com rótulos de baixa cardinalidade', () => {
        const count = vi.fn();
        const gauge = vi.fn();
        const service = new FixedIncomeMetricsService({ count, gauge } as unknown as MetricsService);

        service.sync('cdi_daily', 'success');
        service.indexAge('ipca_monthly', 12);
        service.valuation('index_data_missing', 4);

        expect(count).toHaveBeenCalledWith('vera_fixed_income_index_sync_total', { series: 'cdi_daily', result: 'success' });
        expect(gauge).toHaveBeenCalledWith('vera_fixed_income_index_age_days', 12, { series: 'ipca_monthly' });
        expect(count).toHaveBeenCalledWith('vera_fixed_income_valuation_total', { status: 'index_data_missing' }, 4);
    });
});
