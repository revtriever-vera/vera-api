import { Module, Type } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { CompanyCapabilitiesRepository } from './company-capabilities.repository';
import { CompanyProductLimitsRepository } from './company-product-limits.repository';
import { CompanyProductsRepository } from './company-products.repository';
import { GlobalPlanCapabilitiesRepository } from './global-plan-capabilities.repository';
import { GlobalPlanProductsRepository } from './global-plan-products.repository';
import { GlobalPlansRepository } from './global-plans.repository';
import { GlobalProductLimitsRepository } from './global-product-limits.repository';
import { GlobalProductsRepository } from './global-products.repository';
import { PremiumEndedNotificationsRepository } from './premium-ended-notifications.repository';

const REPOSITORIES: Type[] = [
    GlobalPlansRepository,
    GlobalProductsRepository,
    GlobalPlanProductsRepository,
    GlobalPlanCapabilitiesRepository,
    GlobalProductLimitsRepository,
    CompanyProductsRepository,
    CompanyProductLimitsRepository,
    CompanyCapabilitiesRepository,
    PremiumEndedNotificationsRepository
];

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: REPOSITORIES,
    exports: REPOSITORIES
})
export class PlansRepositoryModule {}
