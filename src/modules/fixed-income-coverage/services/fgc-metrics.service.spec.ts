import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from '../../../core/observability/metrics.service';
import { FgcMetricsService } from './fgc-metrics.service';

describe('FgcMetricsService', () => {
    it('counts the endpoint and observes the over-limit groups without a company label', () => {
        const count = vi.fn();
        const observe = vi.fn();
        const service = new FgcMetricsService({ count, observe } as unknown as MetricsService);

        service.request('simulate');
        service.overLimitGroups(2);

        expect(count).toHaveBeenCalledWith('vera_fgc_requests_total', { endpoint: 'simulate' });
        expect(observe).toHaveBeenCalledWith('vera_fgc_over_limit_groups', 2);
    });
});
