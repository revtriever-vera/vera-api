import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from '../../../core/observability/metrics.service';
import { AllocationMetricsService } from './allocation-metrics.service';

describe('AllocationMetricsService', () => {
    it('conta as ações de classe só pelo rótulo action', () => {
        const count: ReturnType<typeof vi.fn> = vi.fn();
        const metrics: AllocationMetricsService = new AllocationMetricsService({ count } as unknown as MetricsService);

        metrics.classAction('merged');
        metrics.classAction('seeded', 8);

        expect(count).toHaveBeenNthCalledWith(1, 'vera_allocation_class_actions_total', { action: 'merged' }, 1);
        expect(count).toHaveBeenNthCalledWith(2, 'vera_allocation_class_actions_total', { action: 'seeded' }, 8);
    });
});
