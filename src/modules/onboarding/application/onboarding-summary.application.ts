import { Injectable } from '@nestjs/common';
import { CurrentUserService } from '../../identity/services/current-user.service';
import { OnboardingAreaRegistry, OnboardingAreaSummaries } from '../services/onboarding-area.registry';

@Injectable()
export class OnboardingSummaryApplication {
    public constructor(
        private readonly currentUser: CurrentUserService,
        private readonly registry: OnboardingAreaRegistry
    ) {}

    public async summary(): Promise<OnboardingAreaSummaries> {
        const { companyId } = await this.currentUser.require();
        return this.registry.summarize(companyId);
    }
}
