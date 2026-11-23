import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from '../../../core/observability/metrics.service';
import { ScheduleMetricsService } from './schedule-metrics.service';

describe('ScheduleMetricsService', () => {
    it('conta as duas rotas com o resultado como único rótulo', () => {
        const count = vi.fn();
        const service = new ScheduleMetricsService({ count } as unknown as MetricsService);

        service.maturities('ok');
        service.realRates('index_data_missing');

        expect(count).toHaveBeenCalledWith('vera_maturities_requests_total', { result: 'ok' });
        expect(count).toHaveBeenCalledWith('vera_real_rates_requests_total', { result: 'index_data_missing' });
    });
});
