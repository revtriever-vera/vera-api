import { describe, expect, it, vi } from 'vitest';
import { OnboardingStateDomain } from '../domain/onboarding-state.domain';
import { OnboardingState } from '../domain/onboarding.types';
import { OnboardingLogService } from '../services/onboarding-log.service';
import { OnboardingStateApplication } from './onboarding-state.application';

const T0: Date = new Date('2026-10-11T10:00:00.000Z');

function stateOf(patch: Partial<OnboardingState> = {}): OnboardingState {
    return {
        id: 'state-1',
        companyId: 'company-1',
        startedAt: null,
        assetsDoneAt: null,
        assetsSkippedAt: null,
        banksDoneAt: null,
        banksSkippedAt: null,
        completedAt: null,
        dismissedAt: null,
        sampleLoadedAt: null,
        createdAt: T0,
        updatedAt: T0,
        deletedAt: null,
        ...patch
    };
}

function build(domain: Partial<Record<keyof OnboardingStateDomain, unknown>>): {
    application: OnboardingStateApplication;
    log: Record<'started' | 'stepSettled' | 'closed', ReturnType<typeof vi.fn>>;
} {
    const log: Record<'started' | 'stepSettled' | 'closed', ReturnType<typeof vi.fn>> = {
        started: vi.fn(),
        stepSettled: vi.fn(),
        closed: vi.fn()
    };
    const application: OnboardingStateApplication = new OnboardingStateApplication(
        domain as unknown as OnboardingStateDomain,
        log as unknown as OnboardingLogService
    );
    return { application, log };
}

describe('OnboardingStateApplication', () => {
    it('monta a visão com status derivado e carimbos em ISO', async () => {
        const { application } = build({
            current: vi.fn().mockResolvedValue(stateOf({ startedAt: T0, assetsDoneAt: T0, sampleLoadedAt: T0 }))
        });

        await expect(application.current()).resolves.toEqual({
            status: 'banks',
            startedAt: T0.toISOString(),
            steps: {
                assets: { doneAt: T0.toISOString(), skippedAt: null },
                banks: { doneAt: null, skippedAt: null }
            },
            completedAt: null,
            dismissedAt: null,
            sample: { active: true, available: false }
        });
    });

    it('start loga só na primeira vez', async () => {
        const first = build({
            current: vi.fn().mockResolvedValue(stateOf()),
            start: vi.fn().mockResolvedValue(stateOf({ startedAt: T0 }))
        });
        await first.application.start();
        expect(first.log.started).toHaveBeenCalledTimes(1);

        const again = build({
            current: vi.fn().mockResolvedValue(stateOf({ startedAt: T0 })),
            start: vi.fn().mockResolvedValue(stateOf({ startedAt: T0 }))
        });
        await again.application.start();
        expect(again.log.started).not.toHaveBeenCalled();
    });

    it('registra o desfecho da etapa', async () => {
        const { application, log } = build({
            complete: vi.fn().mockResolvedValue(stateOf({ assetsDoneAt: T0 })),
            skip: vi.fn().mockResolvedValue(stateOf({ banksSkippedAt: T0 }))
        });

        await application.completeStep('assets');
        await application.skipStep('banks');

        expect(log.stepSettled).toHaveBeenNthCalledWith(1, 'assets', 'done');
        expect(log.stepSettled).toHaveBeenNthCalledWith(2, 'banks', 'skipped');
    });

    it('fecha medindo o tempo desde a criação e não repete a métrica ao refechar', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(T0.getTime() + 90_000));
        const open = build({
            current: vi.fn().mockResolvedValue(stateOf()),
            close: vi.fn().mockResolvedValue(stateOf({ completedAt: T0 }))
        });
        const view = await open.application.finish();
        expect(view.status).toBe('closed');
        expect(open.log.closed).toHaveBeenCalledWith('finished', 90);

        const closed = build({
            current: vi.fn().mockResolvedValue(stateOf({ dismissedAt: T0 })),
            close: vi.fn().mockResolvedValue(stateOf({ dismissedAt: T0 }))
        });
        await closed.application.dismiss();
        expect(closed.log.closed).not.toHaveBeenCalled();
        vi.useRealTimers();
    });
});
