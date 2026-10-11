import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { ThrottleService } from '../../../core/throttle/throttle.service';
import { CurrentUserService } from '../../identity/services/current-user.service';
import { OnboardingStateDomain } from '../domain/onboarding-state.domain';
import { SampleUnavailableError } from '../domain/onboarding.errors';
import { OnboardingState } from '../domain/onboarding.types';
import { OnboardingSampleLogService, SampleAction } from '../services/onboarding-sample-log.service';
import { SampleAreaResult } from '../services/sample-data.port';
import { SampleDataRegistry } from '../services/sample-data.registry';
import { OnboardingStateView, viewOf } from './onboarding-state.view';

const SEED_LIMIT: number = 10;
const SEED_WINDOW_SECONDS: number = 60 * 60;

@Injectable()
export class OnboardingSampleApplication {
    public constructor(
        private readonly throttle: ThrottleService,
        private readonly currentUser: CurrentUserService,
        private readonly onboarding: OnboardingStateDomain,
        private readonly registry: SampleDataRegistry,
        private readonly log: OnboardingSampleLogService
    ) {}

    public async load(): Promise<OnboardingStateView> {
        const { companyId } = await this.currentUser.require();
        await this.throttle.assertAllowed(`onboarding-sample:${companyId}`, SEED_LIMIT, SEED_WINDOW_SECONDS);
        if (!this.registry.available()) {
            this.log.outcome('seed', 'unavailable');
            throw new SampleUnavailableError();
        }
        return this.guarded('seed', async (): Promise<OnboardingStateView> => this.seed(companyId));
    }

    public async clear(): Promise<OnboardingStateView> {
        const { companyId } = await this.currentUser.require();
        return this.guarded('clear', async (): Promise<OnboardingStateView> => this.wipe(companyId));
    }

    @UsingTransaction()
    private async seed(companyId: string): Promise<OnboardingStateView> {
        const results: SampleAreaResult[] = await this.registry.seedAll(companyId);
        if (!results.some((result: SampleAreaResult): boolean => result.count > 0)) {
            return this.view(await this.onboarding.current());
        }
        await this.onboarding.markSampleLoaded();
        const state: OnboardingState = await this.onboarding.dismissIfOpen();
        this.log.loaded(results);
        return this.view(state);
    }

    @UsingTransaction()
    private async wipe(companyId: string): Promise<OnboardingStateView> {
        const results: SampleAreaResult[] = await this.registry.clearAll(companyId);
        const state: OnboardingState = await this.onboarding.clearSampleMark();
        this.log.cleared(results);
        return this.view(state);
    }

    private async guarded(action: SampleAction, run: () => Promise<OnboardingStateView>): Promise<OnboardingStateView> {
        try {
            const view: OnboardingStateView = await run();
            this.log.outcome(action, 'success');
            return view;
        } catch (error: unknown) {
            this.log.outcome(action, 'failed');
            throw error;
        }
    }

    private view(state: OnboardingState): OnboardingStateView {
        return viewOf(state, this.registry.available());
    }
}
