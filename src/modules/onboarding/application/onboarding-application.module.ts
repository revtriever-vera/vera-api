import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { ThrottleModule } from '../../../core/throttle/throttle.module';
import { OnboardingDomainModule } from '../domain/onboarding-domain.module';
import { OnboardingAreaRegistry } from '../services/onboarding-area.registry';
import { OnboardingLogService } from '../services/onboarding-log.service';
import { OnboardingSampleLogService } from '../services/onboarding-sample-log.service';
import { SampleDataRegistry } from '../services/sample-data.registry';
import { OnboardingSampleApplication } from './onboarding-sample.application';
import { OnboardingStateApplication } from './onboarding-state.application';
import { OnboardingSummaryApplication } from './onboarding-summary.application';

@Module({
    imports: [OnboardingDomainModule, IdentityApplicationModule, ObservabilityModule, DiscoveryModule, ThrottleModule],
    providers: [
        OnboardingLogService,
        OnboardingSampleLogService,
        OnboardingAreaRegistry,
        SampleDataRegistry,
        OnboardingStateApplication,
        OnboardingSummaryApplication,
        OnboardingSampleApplication
    ],
    exports: [OnboardingStateApplication, OnboardingSummaryApplication, OnboardingSampleApplication]
})
export class OnboardingApplicationModule {}
