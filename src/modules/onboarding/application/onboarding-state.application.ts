import { Injectable } from '@nestjs/common';
import { OnboardingStateDomain } from '../domain/onboarding-state.domain';
import { OnboardingCloseOutcome, OnboardingState, OnboardingStep } from '../domain/onboarding.types';
import { OnboardingLogService } from '../services/onboarding-log.service';
import { SampleDataRegistry } from '../services/sample-data.registry';
import { OnboardingStateView, viewOf } from './onboarding-state.view';

const MILLISECONDS_PER_SECOND: number = 1000;

@Injectable()
export class OnboardingStateApplication {
    public constructor(
        private readonly onboarding: OnboardingStateDomain,
        private readonly log: OnboardingLogService,
        private readonly sampleRegistry: SampleDataRegistry
    ) {}

    public async current(): Promise<OnboardingStateView> {
        return this.view(await this.onboarding.current());
    }

    public async start(): Promise<OnboardingStateView> {
        const before: OnboardingState = await this.onboarding.current();
        const state: OnboardingState = await this.onboarding.start();
        if (before.startedAt === null) {
            this.log.started();
        }
        return this.view(state);
    }

    public async completeStep(step: string): Promise<OnboardingStateView> {
        const state: OnboardingState = await this.onboarding.complete(step);
        this.log.stepSettled(step as OnboardingStep, 'done');
        return this.view(state);
    }

    public async skipStep(step: string): Promise<OnboardingStateView> {
        const state: OnboardingState = await this.onboarding.skip(step);
        this.log.stepSettled(step as OnboardingStep, 'skipped');
        return this.view(state);
    }

    public async finish(): Promise<OnboardingStateView> {
        return this.close('finished');
    }

    public async dismiss(): Promise<OnboardingStateView> {
        return this.close('dismissed');
    }

    private view(state: OnboardingState): OnboardingStateView {
        return viewOf(state, this.sampleRegistry.available());
    }

    private async close(outcome: OnboardingCloseOutcome): Promise<OnboardingStateView> {
        const before: OnboardingState = await this.onboarding.current();
        const state: OnboardingState = await this.onboarding.close(outcome);
        if (before.completedAt === null && before.dismissedAt === null) {
            this.log.closed(outcome, (Date.now() - state.createdAt.getTime()) / MILLISECONDS_PER_SECOND);
        }
        return this.view(state);
    }
}
