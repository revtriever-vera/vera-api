import { describe, expect, it, vi } from 'vitest';
import { OnboardingStatesRepository } from '../repositories/onboarding-states.repository';
import { OnboardingAlreadyClosedError, UnknownOnboardingStepError } from './onboarding.errors';
import { OnboardingStateDomain } from './onboarding-state.domain';
import { OnboardingState } from './onboarding.types';

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

function domainOver(state: OnboardingState): { domain: OnboardingStateDomain; stamp: ReturnType<typeof vi.fn> } {
    const stamp: ReturnType<typeof vi.fn> = vi.fn().mockImplementation((_id: string, patch: Partial<OnboardingState>) =>
        Promise.resolve({
            ...state,
            ...patch
        })
    );
    const current: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(state);
    const domain: OnboardingStateDomain = new OnboardingStateDomain({ current, stamp } as unknown as OnboardingStatesRepository);
    return { domain, stamp };
}

describe('OnboardingStateDomain', () => {
    it('start carimba startedAt uma vez só', async () => {
        const first = domainOver(stateOf());
        const started: OnboardingState = await first.domain.start();
        expect(started.startedAt).toBeInstanceOf(Date);

        const again = domainOver(stateOf({ startedAt: T0 }));
        await again.domain.start();
        expect(again.stamp).not.toHaveBeenCalled();
    });

    it('concluir uma etapa pulada limpa o carimbo de pulada', async () => {
        const { domain, stamp } = domainOver(stateOf({ startedAt: T0, assetsSkippedAt: T0 }));

        const result: OnboardingState = await domain.complete('assets');

        expect(stamp).toHaveBeenCalledWith('state-1', { assetsDoneAt: expect.any(Date), assetsSkippedAt: null });
        expect(result.assetsSkippedAt).toBeNull();
        expect(result.assetsDoneAt).toBeInstanceOf(Date);
    });

    it('pular uma etapa feita limpa o carimbo de feita', async () => {
        const { domain, stamp } = domainOver(stateOf({ banksDoneAt: T0 }));

        await domain.skip('banks');

        expect(stamp).toHaveBeenCalledWith('state-1', { banksSkippedAt: expect.any(Date), banksDoneAt: null });
    });

    it('o mesmo passo duas vezes é idempotente', async () => {
        const done = domainOver(stateOf({ assetsDoneAt: T0 }));
        await done.domain.complete('assets');
        const skipped = domainOver(stateOf({ banksSkippedAt: T0 }));
        await skipped.domain.skip('banks');

        expect(done.stamp).not.toHaveBeenCalled();
        expect(skipped.stamp).not.toHaveBeenCalled();
    });

    it('passo desconhecido vira erro 400', async () => {
        const { domain } = domainOver(stateOf());

        await expect(domain.complete('target')).rejects.toBeInstanceOf(UnknownOnboardingStepError);
        await expect(domain.skip('nope')).rejects.toMatchObject({ code: 'onboarding.unknown_step', status: 400 });
    });

    it.each([{ completedAt: T0 }, { dismissedAt: T0 }])(
        'fechado (%o) recusa start, complete e skip',
        async (patch: Partial<OnboardingState>) => {
            const { domain, stamp } = domainOver(stateOf(patch));

            await expect(domain.start()).rejects.toBeInstanceOf(OnboardingAlreadyClosedError);
            await expect(domain.complete('assets')).rejects.toMatchObject({ code: 'onboarding.already_closed', status: 409 });
            await expect(domain.skip('banks')).rejects.toBeInstanceOf(OnboardingAlreadyClosedError);
            expect(stamp).not.toHaveBeenCalled();
        }
    );

    it('fechar carimba o desfecho, é idempotente no mesmo desfecho e recusa o outro', async () => {
        const open = domainOver(stateOf());
        expect((await open.domain.close('finished')).completedAt).toBeInstanceOf(Date);
        expect((await open.domain.close('dismissed')).dismissedAt).toBeInstanceOf(Date);

        const finished = domainOver(stateOf({ completedAt: T0 }));
        await finished.domain.close('finished');
        expect(finished.stamp).not.toHaveBeenCalled();
        await expect(finished.domain.close('dismissed')).rejects.toBeInstanceOf(OnboardingAlreadyClosedError);

        const dismissed = domainOver(stateOf({ dismissedAt: T0 }));
        await dismissed.domain.close('dismissed');
        await expect(dismissed.domain.close('finished')).rejects.toBeInstanceOf(OnboardingAlreadyClosedError);
    });

    it('markSampleLoaded carimba uma vez e preserva o carimbo existente', async () => {
        const fresh = domainOver(stateOf());
        expect((await fresh.domain.markSampleLoaded()).sampleLoadedAt).toBeInstanceOf(Date);

        const loaded = domainOver(stateOf({ sampleLoadedAt: T0 }));
        await expect(loaded.domain.markSampleLoaded()).resolves.toMatchObject({ sampleLoadedAt: T0 });
        expect(loaded.stamp).not.toHaveBeenCalled();
    });

    it('clearSampleMark zera o carimbo e é idempotente sem exemplo ativo', async () => {
        const loaded = domainOver(stateOf({ sampleLoadedAt: T0 }));
        expect((await loaded.domain.clearSampleMark()).sampleLoadedAt).toBeNull();

        const clean = domainOver(stateOf());
        await clean.domain.clearSampleMark();
        expect(clean.stamp).not.toHaveBeenCalled();
    });

    it('dismissIfOpen fecha só o onboarding aberto e não mexe no fechado', async () => {
        const open = domainOver(stateOf());
        expect((await open.domain.dismissIfOpen()).dismissedAt).toBeInstanceOf(Date);

        const finished = domainOver(stateOf({ completedAt: T0 }));
        await expect(finished.domain.dismissIfOpen()).resolves.toMatchObject({ completedAt: T0, dismissedAt: null });
        expect(finished.stamp).not.toHaveBeenCalled();
    });

    it('current delega ao repositório', async () => {
        const { domain } = domainOver(stateOf());
        await expect(domain.current()).resolves.toMatchObject({ id: 'state-1' });
    });
});
