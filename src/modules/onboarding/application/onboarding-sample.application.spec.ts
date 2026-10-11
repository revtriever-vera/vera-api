import { describe, expect, it, vi } from 'vitest';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { ThrottleService } from '../../../core/throttle/throttle.service';
import { CurrentUserService } from '../../identity/services/current-user.service';
import { OnboardingStateDomain } from '../domain/onboarding-state.domain';
import { SampleFailedError } from '../domain/onboarding.errors';
import { OnboardingState } from '../domain/onboarding.types';
import { OnboardingSampleLogService } from '../services/onboarding-sample-log.service';
import { SampleDataRegistry } from '../services/sample-data.registry';
import { OnboardingSampleApplication } from './onboarding-sample.application';

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

interface Harness {
    readonly application: OnboardingSampleApplication;
    readonly assertAllowed: ReturnType<typeof vi.fn>;
    readonly domain: Record<'current' | 'markSampleLoaded' | 'clearSampleMark' | 'dismissIfOpen', ReturnType<typeof vi.fn>>;
    readonly registry: Record<'available' | 'seedAll' | 'clearAll', ReturnType<typeof vi.fn>>;
    readonly log: Record<'loaded' | 'cleared' | 'outcome', ReturnType<typeof vi.fn>>;
}

function build(options: { available?: boolean; state?: OnboardingState } = {}): Harness {
    TransactionalContext.set({ withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn() } as unknown as DatabaseClient);
    const state: OnboardingState = options.state ?? stateOf();
    const assertAllowed: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const domain: Harness['domain'] = {
        current: vi.fn().mockResolvedValue(state),
        markSampleLoaded: vi.fn().mockResolvedValue(stateOf({ sampleLoadedAt: T0 })),
        clearSampleMark: vi.fn().mockResolvedValue(stateOf()),
        dismissIfOpen: vi.fn().mockResolvedValue(stateOf({ sampleLoadedAt: T0, dismissedAt: T0 }))
    };
    const registry: Harness['registry'] = {
        available: vi.fn().mockReturnValue(options.available ?? true),
        seedAll: vi.fn().mockResolvedValue([]),
        clearAll: vi.fn().mockResolvedValue([])
    };
    const log: Harness['log'] = { loaded: vi.fn(), cleared: vi.fn(), outcome: vi.fn() };
    const application: OnboardingSampleApplication = new OnboardingSampleApplication(
        { assertAllowed } as unknown as ThrottleService,
        { require: vi.fn().mockResolvedValue({ companyId: 'company-1' }) } as unknown as CurrentUserService,
        domain as unknown as OnboardingStateDomain,
        registry as unknown as SampleDataRegistry,
        log as unknown as OnboardingSampleLogService
    );
    return { application, assertAllowed, domain, registry, log };
}

describe('OnboardingSampleApplication', () => {
    it('sem nenhuma porta responde sample_unavailable e conta o desfecho', async () => {
        const { application, registry, log, assertAllowed } = build({ available: false });

        await expect(application.load()).rejects.toMatchObject({ code: 'onboarding.sample_unavailable', status: 409 });
        expect(assertAllowed).toHaveBeenCalledWith('onboarding-sample:company-1', 10, 3600);
        expect(registry.seedAll).not.toHaveBeenCalled();
        expect(log.outcome).toHaveBeenCalledWith('seed', 'unavailable');
    });

    it('semeia as áreas, marca o estado, fecha o onboarding aberto e registra', async () => {
        const { application, registry, domain, log } = build();
        const results = [
            { area: 'assets', count: 6 },
            { area: 'spending', count: 4 }
        ];
        registry.seedAll.mockResolvedValue(results);

        const view = await application.load();

        expect(registry.seedAll).toHaveBeenCalledWith('company-1');
        expect(domain.markSampleLoaded).toHaveBeenCalledOnce();
        expect(domain.dismissIfOpen).toHaveBeenCalledOnce();
        expect(view).toMatchObject({ status: 'closed', sample: { active: true, available: true } });
        expect(log.loaded).toHaveBeenCalledWith(results);
        expect(log.outcome).toHaveBeenCalledWith('seed', 'success');
    });

    it('com todas as portas devolvendo 0 não marca nem fecha nada', async () => {
        const { application, registry, domain } = build();
        registry.seedAll.mockResolvedValue([
            { area: 'assets', count: 0 },
            { area: 'spending', count: 0 }
        ]);

        const view = await application.load();

        expect(domain.markSampleLoaded).not.toHaveBeenCalled();
        expect(domain.dismissIfOpen).not.toHaveBeenCalled();
        expect(view).toMatchObject({ status: 'welcome', sample: { active: false } });
    });

    it('falha de uma porta propaga o erro, conta failed e não marca o estado', async () => {
        const { application, registry, domain, log } = build();
        registry.seedAll.mockRejectedValue(new SampleFailedError('spending'));

        await expect(application.load()).rejects.toMatchObject({ code: 'onboarding.sample_failed', meta: { area: 'spending' } });

        expect(domain.markSampleLoaded).not.toHaveBeenCalled();
        expect(log.outcome).toHaveBeenCalledWith('seed', 'failed');
    });

    it('limpar chama todas as portas, zera a marca e não mexe no fechamento', async () => {
        const { application, registry, domain, log } = build();
        const results = [{ area: 'assets', count: 6 }];
        registry.clearAll.mockResolvedValue(results);

        const view = await application.clear();

        expect(registry.clearAll).toHaveBeenCalledWith('company-1');
        expect(domain.clearSampleMark).toHaveBeenCalledOnce();
        expect(domain.dismissIfOpen).not.toHaveBeenCalled();
        expect(view.sample).toEqual({ active: false, available: true });
        expect(log.cleared).toHaveBeenCalledWith(results);
        expect(log.outcome).toHaveBeenCalledWith('clear', 'success');
    });

    it('limpar funciona sem nenhuma porta registrada', async () => {
        const { application, log } = build({ available: false });

        await expect(application.clear()).resolves.toMatchObject({ sample: { active: false, available: false } });
        expect(log.outcome).toHaveBeenCalledWith('clear', 'success');
    });

    it('falha ao limpar propaga o erro e conta failed', async () => {
        const { application, registry, log } = build();
        registry.clearAll.mockRejectedValue(new SampleFailedError('assets'));

        await expect(application.clear()).rejects.toBeInstanceOf(SampleFailedError);
        expect(log.outcome).toHaveBeenCalledWith('clear', 'failed');
    });
});
