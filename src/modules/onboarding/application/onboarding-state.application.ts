import { Injectable } from '@nestjs/common';
import { OnboardingStateDomain } from '../domain/onboarding-state.domain';
import {
    doneAtOf,
    ONBOARDING_STEPS,
    OnboardingCloseOutcome,
    OnboardingState,
    OnboardingStatus,
    OnboardingStep,
    onboardingStatusOf,
    skippedAtOf
} from '../domain/onboarding.types';
import { OnboardingLogService } from '../services/onboarding-log.service';

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

const MILLISECONDS_PER_SECOND: number = 1000;

function isoOf(value: Date | null): string | null {
    return value ? value.toISOString() : null;
}

function stepViewOf(state: OnboardingState, step: OnboardingStep): OnboardingStepView {
    return { doneAt: isoOf(doneAtOf(state, step)), skippedAt: isoOf(skippedAtOf(state, step)) };
}

function viewOf(state: OnboardingState): OnboardingStateView {
    return {
        status: onboardingStatusOf(state),
        startedAt: isoOf(state.startedAt),
        steps: {
            assets: stepViewOf(state, ONBOARDING_STEPS.assets),
            banks: stepViewOf(state, ONBOARDING_STEPS.banks)
        },
        completedAt: isoOf(state.completedAt),
        dismissedAt: isoOf(state.dismissedAt),
        sample: { active: state.sampleLoadedAt !== null, available: false }
    };
}

@Injectable()
export class OnboardingStateApplication {
    public constructor(
        private readonly onboarding: OnboardingStateDomain,
        private readonly log: OnboardingLogService
    ) {}

    public async current(): Promise<OnboardingStateView> {
        return viewOf(await this.onboarding.current());
    }

    public async start(): Promise<OnboardingStateView> {
        const before: OnboardingState = await this.onboarding.current();
        const state: OnboardingState = await this.onboarding.start();
        if (before.startedAt === null) {
            this.log.started();
        }
        return viewOf(state);
    }

    public async completeStep(step: string): Promise<OnboardingStateView> {
        const state: OnboardingState = await this.onboarding.complete(step);
        this.log.stepSettled(step as OnboardingStep, 'done');
        return viewOf(state);
    }

    public async skipStep(step: string): Promise<OnboardingStateView> {
        const state: OnboardingState = await this.onboarding.skip(step);
        this.log.stepSettled(step as OnboardingStep, 'skipped');
        return viewOf(state);
    }

    public async finish(): Promise<OnboardingStateView> {
        return this.close('finished');
    }

    public async dismiss(): Promise<OnboardingStateView> {
        return this.close('dismissed');
    }

    private async close(outcome: OnboardingCloseOutcome): Promise<OnboardingStateView> {
        const before: OnboardingState = await this.onboarding.current();
        const state: OnboardingState = await this.onboarding.close(outcome);
        if (before.completedAt === null && before.dismissedAt === null) {
            this.log.closed(outcome, (Date.now() - state.createdAt.getTime()) / MILLISECONDS_PER_SECOND);
        }
        return viewOf(state);
    }
}
