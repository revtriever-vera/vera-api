import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { OnboardingDomainModule } from '../domain/onboarding-domain.module';
import { OnboardingAreaRegistry } from '../services/onboarding-area.registry';
import { OnboardingLogService } from '../services/onboarding-log.service';
import { OnboardingStateApplication } from './onboarding-state.application';
import { OnboardingSummaryApplication } from './onboarding-summary.application';

@Module({
    imports: [OnboardingDomainModule, IdentityApplicationModule, ObservabilityModule, DiscoveryModule],
    providers: [OnboardingLogService, OnboardingAreaRegistry, OnboardingStateApplication, OnboardingSummaryApplication],
    exports: [OnboardingStateApplication, OnboardingSummaryApplication]
})
export class OnboardingApplicationModule {}
