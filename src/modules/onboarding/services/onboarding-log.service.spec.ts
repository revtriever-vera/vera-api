import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { MetricsService } from '../../../core/observability/metrics.service';
import { OnboardingLogService } from './onboarding-log.service';

function build(): {
    service: OnboardingLogService;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    observe: ReturnType<typeof vi.fn>;
} {
    const info: ReturnType<typeof vi.fn> = vi.fn();
    const warn: ReturnType<typeof vi.fn> = vi.fn();
    const count: ReturnType<typeof vi.fn> = vi.fn();
    const observe: ReturnType<typeof vi.fn> = vi.fn();
    const service: OnboardingLogService = new OnboardingLogService(
        { info, warn } as unknown as LogService,
        { count, observe } as unknown as MetricsService
    );
    return { service, info, warn, count, observe };
}

describe('OnboardingLogService', () => {
    it('registra início', () => {
        const { service, info } = build();
        service.started();
        expect(info).toHaveBeenCalledWith({ message: 'onboarding started', identifier: 'onboarding-wizard' });
    });

    it('registra etapa resolvida com métrica por etapa e desfecho', () => {
        const { service, info, count } = build();
        service.stepSettled('assets', 'skipped');
        expect(info).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'onboarding step settled', meta: { step: 'assets', outcome: 'skipped' } })
        );
        expect(count).toHaveBeenCalledWith('vera_onboarding_step_total', { step: 'assets', outcome: 'skipped' });
    });

    it.each([
        ['finished', 'onboarding finished'],
        ['dismissed', 'onboarding dismissed']
    ] as const)('registra fechamento %s com contador e histograma', (outcome, message) => {
        const { service, info, count, observe } = build();
        service.closed(outcome, 42);
        expect(info).toHaveBeenCalledWith(expect.objectContaining({ message }));
        expect(count).toHaveBeenCalledWith('vera_onboarding_closed_total', { outcome });
        expect(observe).toHaveBeenCalledWith('vera_onboarding_time_to_close_seconds', 42);
    });

    it('avisa falha de área sem expor dados da pessoa', () => {
        const { service, warn } = build();
        service.summaryAreaFailed('banks', new Error('x'));
        expect(warn).toHaveBeenCalledWith(expect.objectContaining({ message: 'onboarding summary area failed', meta: { area: 'banks' } }));
    });
});
