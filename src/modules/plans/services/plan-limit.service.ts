import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { plansConfig } from '../config/plans.config';
import { PlanCatalogDomain } from '../domain/plan-catalog.domain';
import { PlanLimitDomain } from '../domain/plan-limit.domain';
import { CompanyProductLimit, GlobalProduct, GlobalProductLimit, LimitRow, PRODUCT_KEYS, USAGE_UNITS } from '../domain/plans.types';

@Injectable()
export class PlanLimitService {
    public constructor(
        @Inject(plansConfig.KEY) private readonly config: ConfigType<typeof plansConfig>,
        private readonly catalog: PlanCatalogDomain,
        private readonly limits: PlanLimitDomain
    ) {}

    public async capMicros(at: Date = new Date()): Promise<number | null> {
        if (this.config.DEPLOYMENT_MODE === 'self_hosted') {
            return null;
        }
        const product: GlobalProduct = await this.catalog.productOf(PRODUCT_KEYS.paidUsage);
        const company: CompanyProductLimit[] = await this.limits.companyLimits(product.id, USAGE_UNITS.costMicros);
        const catalog: GlobalProductLimit[] = await this.catalog.limitsOf(PRODUCT_KEYS.paidUsage, USAGE_UNITS.costMicros);
        const picked: LimitRow | null = PlanLimitDomain.pick(company, catalog, at);
        return picked === null ? null : Number(picked.quantity);
    }
}
