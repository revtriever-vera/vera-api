import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { QueueModule } from '../../../core/queue/queue.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { plansConfig } from '../config/plans.config';
import { PlansDomainModule } from '../domain/plans-domain.module';
import { FeatureStateService } from '../services/feature-state.service';
import { PaidFeatureAvailabilityRegistry } from '../services/paid-feature-availability.registry';
import { PaidUsageReader } from '../services/paid-usage-reader.service';
import { PlanContractService } from '../services/plan-contract.service';
import { PlanGateService } from '../services/plan-gate.service';
import { PlanLimitService } from '../services/plan-limit.service';
import { PlanResolverService } from '../services/plan-resolver.service';
import { PlansLogService } from '../services/plans-log.service';
import { PlansMetricsService } from '../services/plans-metrics.service';
import { PremiumEndedService } from '../services/premium-ended.service';
import { PremiumGuard } from '../services/premium.guard';
import { PremiumLifecycleRegistry } from '../services/premium-lifecycle.registry';
import { BillingMeApplication } from './billing-me.application';
import { PremiumEndedRetryApplication } from './premium-ended-retry.application';

@Module({
    imports: [
        ConfigModule.forFeature(plansConfig),
        DiscoveryModule,
        PlansDomainModule,
        IdentityApplicationModule,
        ObservabilityModule,
        QueueModule
    ],
    providers: [
        BillingMeApplication,
        PremiumEndedRetryApplication,
        PaidFeatureAvailabilityRegistry,
        PremiumLifecycleRegistry,
        PaidUsageReader,
        PlanResolverService,
        PlanLimitService,
        FeatureStateService,
        PlanGateService,
        PlanContractService,
        PremiumEndedService,
        PremiumGuard,
        PlansLogService,
        PlansMetricsService
    ],
    exports: [BillingMeApplication, PremiumEndedRetryApplication, PlanGateService, PlanContractService, PlanLimitService, PremiumGuard]
})
export class PlansApplicationModule {}
