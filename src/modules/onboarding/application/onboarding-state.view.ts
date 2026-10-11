import {
    doneAtOf,
    ONBOARDING_STEPS,
    OnboardingState,
    OnboardingStatus,
    OnboardingStep,
    onboardingStatusOf,
    skippedAtOf
} from '../domain/onboarding.types';

export interface OnboardingStepView {
    readonly doneAt: string | null;
    readonly skippedAt: string | null;
}

export interface OnboardingStateView {
    readonly status: OnboardingStatus;
    readonly startedAt: string | null;
    readonly steps: {
        readonly assets: OnboardingStepView;
        readonly banks: OnboardingStepView;
    };
    readonly completedAt: string | null;
    readonly dismissedAt: string | null;
    readonly sample: {
        readonly active: boolean;
        readonly available: boolean;
    };
}

function isoOf(value: Date | null): string | null {
    return value ? value.toISOString() : null;
}

function stepViewOf(state: OnboardingState, step: OnboardingStep): OnboardingStepView {
    return { doneAt: isoOf(doneAtOf(state, step)), skippedAt: isoOf(skippedAtOf(state, step)) };
}

export function viewOf(state: OnboardingState, available: boolean): OnboardingStateView {
    return {
        status: onboardingStatusOf(state),
        startedAt: isoOf(state.startedAt),
        steps: {
            assets: stepViewOf(state, ONBOARDING_STEPS.assets),
            banks: stepViewOf(state, ONBOARDING_STEPS.banks)
        },
        completedAt: isoOf(state.completedAt),
        dismissedAt: isoOf(state.dismissedAt),
        sample: { active: state.sampleLoadedAt !== null, available }
    };
}
