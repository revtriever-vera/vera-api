import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { MetricsService } from '../../../core/observability/metrics.service';
import { OnboardingSampleLogService } from './onboarding-sample-log.service';

function build(): {
    service: OnboardingSampleLogService;
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
} {
    const info: ReturnType<typeof vi.fn> = vi.fn();
    const error: ReturnType<typeof vi.fn> = vi.fn();
    const count: ReturnType<typeof vi.fn> = vi.fn();
    const service: OnboardingSampleLogService = new OnboardingSampleLogService(
        { info, error } as unknown as LogService,
        { count } as unknown as MetricsService
    );
    return { service, info, error, count };
}

describe('OnboardingSampleLogService', () => {
    it('registra a carga com a contagem por área', () => {
        const { service, info } = build();
        service.loaded([{ area: 'assets', count: 3 }]);
        expect(info).toHaveBeenCalledWith({
            message: 'sample data loaded',
            identifier: 'onboarding-sample',
            meta: { areas: [{ area: 'assets', seeded: 3 }] }
        });
    });

    it('registra a limpeza com a contagem por área', () => {
        const { service, info } = build();
        service.cleared([{ area: 'assets', count: 3 }]);
        expect(info).toHaveBeenCalledWith({
            message: 'sample data cleared',
            identifier: 'onboarding-sample',
            meta: { areas: [{ area: 'assets', cleared: 3 }] }
        });
    });

    it('registra a falha de área sem dados da pessoa', () => {
        const { service, error } = build();
        const cause: Error = new Error('x');
        service.areaFailed('banks', cause);
        expect(error).toHaveBeenCalledWith({
            message: 'sample data area failed',
            identifier: 'onboarding-sample',
            meta: { area: 'banks' },
            error: cause
        });
    });

    it('conta o desfecho por ação', () => {
        const { service, count } = build();
        service.outcome('seed', 'unavailable');
        expect(count).toHaveBeenCalledWith('vera_onboarding_sample_total', { action: 'seed', outcome: 'unavailable' });
    });
});
