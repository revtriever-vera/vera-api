import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from '../../../core/observability/metrics.service';
import { SpendingCutsMetricsService } from './spending-cuts-metrics.service';

describe('SpendingCutsMetricsService', () => {
    it('conta por status', () => {
        const count = vi.fn();

        new SpendingCutsMetricsService({ count } as unknown as MetricsService).cuts('goal_met');

        expect(count).toHaveBeenCalledWith('vera_spending_cuts_total', { status: 'goal_met' });
    });
});
