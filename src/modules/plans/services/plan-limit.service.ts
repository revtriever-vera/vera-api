import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { plansConfig } from '../config/plans.config';
import { PlanCatalogDomain } from '../domain/plan-catalog.domain';
import { PlanLimitDomain } from '../domain/plan-limit.domain';
import {
    CompanyProductLimit,
    EffectivePlan,
    GlobalProduct,
    GlobalProductLimit,
    LimitRow,
    PRODUCT_KEYS,
    USAGE_UNITS
} from '../domain/plans.types';
import { PlanResolverService } from './plan-resolver.service';

@Injectable()
export class PlanLimitService {
    public constructor(
        @Inject(plansConfig.KEY) private readonly config: ConfigType<typeof plansConfig>,
        private readonly catalog: PlanCatalogDomain,
        private readonly limits: PlanLimitDomain,
        private readonly resolver: PlanResolverService
    ) {}

    public async capMicros(configuredMicros: number | null = null, at: Date = new Date()): Promise<number | null> {
        if (this.config.DEPLOYMENT_MODE === 'self_hosted') {
            return null;
        }
        const product: GlobalProduct = await this.catalog.productOf(PRODUCT_KEYS.paidUsage);
        const company: CompanyProductLimit[] = await this.limits.companyLimits(product.id, USAGE_UNITS.costMicros);
        const plan: GlobalProductLimit[] = await this.planLimits(product.id);
        const picked: LimitRow | null = PlanLimitDomain.pick(company, plan, at);
        return picked === null ? configuredMicros : Number(picked.quantity);
    }

    private async planLimits(productId: string): Promise<GlobalProductLimit[]> {
        const plan: EffectivePlan = await this.resolver.planOf();
        if (plan === 'self_hosted') {
            return [];
        }
        return this.catalog.limitsOf(plan, productId, USAGE_UNITS.costMicros);
    }
}
