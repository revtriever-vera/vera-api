import { describe, expect, it } from 'vitest';
import {
    completionPatchFor,
    isOnboardingStep,
    isStepResolved,
    OnboardingState,
    onboardingStatusOf,
    OnboardingStatus,
    skipPatchFor
} from './onboarding.types';

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

describe('onboardingStatusOf', () => {
    const cases: ReadonlyArray<readonly [string, Partial<OnboardingState>, OnboardingStatus]> = [
        ['sem startedAt', {}, 'welcome'],
        ['sem startedAt mesmo com etapa feita', { assetsDoneAt: T0 }, 'welcome'],
        ['iniciado e nada resolvido', { startedAt: T0 }, 'assets'],
        ['só ativos feitos', { startedAt: T0, assetsDoneAt: T0 }, 'banks'],
        ['ativos pulados e bancos feitos', { startedAt: T0, assetsSkippedAt: T0, banksDoneAt: T0 }, 'summary'],
        ['bancos resolvidos antes dos ativos', { startedAt: T0, banksSkippedAt: T0 }, 'assets'],
        ['as duas etapas resolvidas', { startedAt: T0, assetsDoneAt: T0, banksSkippedAt: T0 }, 'summary'],
        ['completedAt', { startedAt: T0, completedAt: T0 }, 'closed'],
        ['dismissedAt sem startedAt', { dismissedAt: T0 }, 'closed']
    ];

    it.each(cases)('%s', (_label: string, patch: Partial<OnboardingState>, expected: OnboardingStatus) => {
        expect(onboardingStatusOf(stateOf(patch))).toBe(expected);
    });
});

describe('helpers de etapa', () => {
    it('reconhece só ativos e bancos como etapas', () => {
        expect(isOnboardingStep('assets')).toBe(true);
        expect(isOnboardingStep('banks')).toBe(true);
        expect(isOnboardingStep('target')).toBe(false);
    });

    it('etapa resolvida é feita ou pulada', () => {
        expect(isStepResolved(stateOf(), 'assets')).toBe(false);
        expect(isStepResolved(stateOf({ assetsDoneAt: T0 }), 'assets')).toBe(true);
        expect(isStepResolved(stateOf({ banksSkippedAt: T0 }), 'banks')).toBe(true);
    });

    it('concluir limpa o carimbo de pulada e pular limpa o de feita', () => {
        expect(completionPatchFor('banks', T0)).toEqual({ banksDoneAt: T0, banksSkippedAt: null });
        expect(skipPatchFor('assets', T0)).toEqual({ assetsSkippedAt: T0, assetsDoneAt: null });
    });
});
