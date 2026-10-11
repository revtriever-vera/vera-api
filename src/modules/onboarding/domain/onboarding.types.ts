import { Insertable, Selectable, Updateable } from 'kysely';
import { OnboardingStates } from '../../../core/database/generated/database.types';

export type OnboardingState = Selectable<OnboardingStates>;
export type NewOnboardingState = Insertable<OnboardingStates>;
export type OnboardingStateUpdate = Updateable<OnboardingStates>;

export const ONBOARDING_STEPS = {
    assets: 'assets',
    banks: 'banks'
} as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[keyof typeof ONBOARDING_STEPS];

export const ONBOARDING_STATUSES = {
    welcome: 'welcome',
    assets: 'assets',
    banks: 'banks',
    summary: 'summary',
    closed: 'closed'
} as const;

export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[keyof typeof ONBOARDING_STATUSES];

export type OnboardingCloseOutcome = 'finished' | 'dismissed';

export type OnboardingStepOutcome = 'done' | 'skipped';

type StepColumn = 'assetsDoneAt' | 'assetsSkippedAt' | 'banksDoneAt' | 'banksSkippedAt';

const DONE_COLUMNS: Readonly<Record<OnboardingStep, StepColumn>> = {
    assets: 'assetsDoneAt',
    banks: 'banksDoneAt'
};

const SKIPPED_COLUMNS: Readonly<Record<OnboardingStep, StepColumn>> = {
    assets: 'assetsSkippedAt',
    banks: 'banksSkippedAt'
};

export function isOnboardingStep(value: string): value is OnboardingStep {
    return Object.values<string>(ONBOARDING_STEPS).includes(value);
}

export function doneAtOf(state: OnboardingState, step: OnboardingStep): Date | null {
    return state[DONE_COLUMNS[step]];
}

export function skippedAtOf(state: OnboardingState, step: OnboardingStep): Date | null {
    return state[SKIPPED_COLUMNS[step]];
}

export function isStepResolved(state: OnboardingState, step: OnboardingStep): boolean {
    return doneAtOf(state, step) !== null || skippedAtOf(state, step) !== null;
}

export function isClosed(state: OnboardingState): boolean {
    return state.completedAt !== null || state.dismissedAt !== null;
}

export function onboardingStatusOf(state: OnboardingState): OnboardingStatus {
    if (isClosed(state)) {
        return ONBOARDING_STATUSES.closed;
    }
    if (state.startedAt === null) {
        return ONBOARDING_STATUSES.welcome;
    }
    if (!isStepResolved(state, ONBOARDING_STEPS.assets)) {
        return ONBOARDING_STATUSES.assets;
    }
    if (!isStepResolved(state, ONBOARDING_STEPS.banks)) {
        return ONBOARDING_STATUSES.banks;
    }
    return ONBOARDING_STATUSES.summary;
}

export function completionPatchFor(step: OnboardingStep, now: Date): OnboardingStateUpdate {
    return { [DONE_COLUMNS[step]]: now, [SKIPPED_COLUMNS[step]]: null };
}

export function skipPatchFor(step: OnboardingStep, now: Date): OnboardingStateUpdate {
    return { [SKIPPED_COLUMNS[step]]: now, [DONE_COLUMNS[step]]: null };
}
