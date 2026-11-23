import { Module } from '@nestjs/common';
import { PlansRepositoryModule } from '../repositories/plans-repository.module';
import { PlanCatalogDomain } from './plan-catalog.domain';
import { PlanLimitDomain } from './plan-limit.domain';
import { PlanDomain } from './plan.domain';
import { PremiumEndedNotificationDomain } from './premium-ended-notification.domain';

@Module({
    imports: [PlansRepositoryModule],
    providers: [PlanCatalogDomain, PlanDomain, PlanLimitDomain, PremiumEndedNotificationDomain],
    exports: [PlanCatalogDomain, PlanDomain, PlanLimitDomain, PremiumEndedNotificationDomain]
})
export class PlansDomainModule {}
