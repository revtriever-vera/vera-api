import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from '../../../core/observability/metrics.service';
import { IdentityMetricsService } from './identity-metrics.service';

describe('IdentityMetricsService', () => {
    it('conta o refresh por desfecho, sem rótulos pessoais', () => {
        const count: ReturnType<typeof vi.fn> = vi.fn();

        new IdentityMetricsService({ count } as unknown as MetricsService).refresh('reused');

        expect(count).toHaveBeenCalledWith('vera_auth_refresh_total', { outcome: 'reused' });
    });
});
