import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from '../../../core/observability/metrics.service';
import { ContributionMetricsService } from './contribution-metrics.service';

describe('ContributionMetricsService', () => {
    it('counts the suggestions by result', () => {
        const count = vi.fn();

        new ContributionMetricsService({ count } as unknown as MetricsService).suggestion('targets_not_set');

        expect(count).toHaveBeenCalledExactlyOnceWith('vera_contribution_suggestions_total', { result: 'targets_not_set' });
    });
});
