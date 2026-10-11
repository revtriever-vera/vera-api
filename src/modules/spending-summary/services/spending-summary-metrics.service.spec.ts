import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from '../../../core/observability/metrics.service';
import { SpendingSummaryMetricsService } from './spending-summary-metrics.service';

describe('SpendingSummaryMetricsService', () => {
    it('observa a duração em segundos', () => {
        const observe = vi.fn();

        new SpendingSummaryMetricsService({ observe } as unknown as MetricsService).summaryDuration(250);

        expect(observe).toHaveBeenCalledWith('vera_spending_summary_duration_seconds', 0.25);
    });
});
