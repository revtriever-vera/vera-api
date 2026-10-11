import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from '../../../core/observability/metrics.service';
import { PositionsMetricsService } from './positions-metrics.service';

describe('PositionsMetricsService', () => {
    it('conta a ação sem label por company', () => {
        const count: ReturnType<typeof vi.fn> = vi.fn();

        new PositionsMetricsService({ count } as unknown as MetricsService).action('removed');

        expect(count).toHaveBeenCalledWith('vera_positions_total', { action: 'removed' });
    });
});
