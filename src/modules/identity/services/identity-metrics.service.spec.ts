import { describe, expect, it, vi } from 'vitest';
import { MetricsService } from '../../../core/observability/metrics.service';
import { IdentityMetricsService } from './identity-metrics.service';

describe('IdentityMetricsService', () => {
    it('conta o refresh por desfecho, sem rótulos pessoais', () => {
        const count: ReturnType<typeof vi.fn> = vi.fn();

        new IdentityMetricsService({ count } as unknown as MetricsService).refresh('reused');

        expect(count).toHaveBeenCalledWith('vera_auth_refresh_total', { outcome: 'reused' });
    });

    it('conta o login por provedor e desfecho e mede a latência da verificação', () => {
        const count: ReturnType<typeof vi.fn> = vi.fn();
        const observe: ReturnType<typeof vi.fn> = vi.fn();
        const metrics: IdentityMetricsService = new IdentityMetricsService({ count, observe } as unknown as MetricsService);

        metrics.login('facebook', 'new_account');
        metrics.providerLatency('facebook', 0.4);

        expect(count).toHaveBeenCalledWith('vera_auth_logins_total', { provider: 'facebook', outcome: 'new_account' });
        expect(observe).toHaveBeenCalledWith('vera_auth_provider_latency_seconds', 0.4, { provider: 'facebook' });
    });

    it('conta exportação e exclusão de conta por desfecho', () => {
        const count: ReturnType<typeof vi.fn> = vi.fn();
        const metrics: IdentityMetricsService = new IdentityMetricsService({ count } as unknown as MetricsService);

        metrics.accountExport('failed');
        metrics.accountDeletion('erasure_failed');

        expect(count).toHaveBeenCalledWith('vera_account_exports_total', { outcome: 'failed' });
        expect(count).toHaveBeenCalledWith('vera_account_deletions_total', { outcome: 'erasure_failed' });
    });
});
