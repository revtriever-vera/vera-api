import { Injectable } from '@nestjs/common';
import { OnboardingStatesRepository } from '../repositories/onboarding-states.repository';
import { OnboardingAlreadyClosedError, UnknownOnboardingStepError } from './onboarding.errors';
import {
    completionPatchFor,
    doneAtOf,
    isClosed,
    isOnboardingStep,
    OnboardingCloseOutcome,
    OnboardingState,
    OnboardingStateUpdate,
    OnboardingStep,
    skipPatchFor,
    skippedAtOf
} from './onboarding.types';

@Injectable()
export class OnboardingStateDomain {
    public constructor(private readonly states: OnboardingStatesRepository) {}

    public async current(): Promise<OnboardingState> {
        return this.states.current();
    }

    public async start(): Promise<OnboardingState> {
        const state: OnboardingState = await this.openState();
        if (state.startedAt !== null) {
            return state;
        }
        return this.states.stamp(state.id, { startedAt: new Date() });
    }

    public async complete(step: string): Promise<OnboardingState> {
        const resolved: OnboardingStep = this.parseStep(step);
        const state: OnboardingState = await this.openState();
        if (doneAtOf(state, resolved) !== null) {
            return state;
        }
        return this.states.stamp(state.id, completionPatchFor(resolved, new Date()));
    }

    public async skip(step: string): Promise<OnboardingState> {
        const resolved: OnboardingStep = this.parseStep(step);
        const state: OnboardingState = await this.openState();
        if (skippedAtOf(state, resolved) !== null) {
            return state;
        }
        return this.states.stamp(state.id, skipPatchFor(resolved, new Date()));
    }

    public async close(outcome: OnboardingCloseOutcome): Promise<OnboardingState> {
        const state: OnboardingState = await this.current();
        const own: Date | null = outcome === 'finished' ? state.completedAt : state.dismissedAt;
        if (own !== null) {
            return state;
        }
        if (isClosed(state)) {
            throw new OnboardingAlreadyClosedError();
        }
        const patch: OnboardingStateUpdate = outcome === 'finished' ? { completedAt: new Date() } : { dismissedAt: new Date() };
        return this.states.stamp(state.id, patch);
    }

    public async markSampleLoaded(): Promise<OnboardingState> {
        const state: OnboardingState = await this.current();
        if (state.sampleLoadedAt !== null) {
            return state;
        }
        return this.states.stamp(state.id, { sampleLoadedAt: new Date() });
    }

    public async clearSampleMark(): Promise<OnboardingState> {
        const state: OnboardingState = await this.current();
        if (state.sampleLoadedAt === null) {
            return state;
        }
        return this.states.stamp(state.id, { sampleLoadedAt: null });
    }

    public async dismissIfOpen(): Promise<OnboardingState> {
        const state: OnboardingState = await this.current();
        if (isClosed(state)) {
            return state;
        }
        return this.states.stamp(state.id, { dismissedAt: new Date() });
    }

    private async openState(): Promise<OnboardingState> {
        const state: OnboardingState = await this.current();
        if (isClosed(state)) {
            throw new OnboardingAlreadyClosedError();
        }
        return state;
    }

    private parseStep(step: string): OnboardingStep {
        if (!isOnboardingStep(step)) {
            throw new UnknownOnboardingStepError(step);
        }
        return step;
    }
}
