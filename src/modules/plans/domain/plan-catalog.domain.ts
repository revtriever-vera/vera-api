import { Injectable } from '@nestjs/common';
import { GlobalPlanCapabilitiesRepository } from '../repositories/global-plan-capabilities.repository';
import { GlobalPlanProductsRepository } from '../repositories/global-plan-products.repository';
import { GlobalPlansRepository } from '../repositories/global-plans.repository';
import { GlobalProductLimitsRepository } from '../repositories/global-product-limits.repository';
import { GlobalProductsRepository } from '../repositories/global-products.repository';
import { GlobalPlan, GlobalProduct, GlobalProductLimit, PAID_FEATURES, PaidFeature } from './plans.types';

@Injectable()
export class PlanCatalogDomain {
    public constructor(
        private readonly plans: GlobalPlansRepository,
        private readonly products: GlobalProductsRepository,
        private readonly planProducts: GlobalPlanProductsRepository,
        private readonly planCapabilities: GlobalPlanCapabilitiesRepository,
        private readonly productLimits: GlobalProductLimitsRepository
    ) {}

    public async productOf(key: string): Promise<GlobalProduct> {
        const product: GlobalProduct | null = await this.products.findByKey(key);
        if (product === null) {
            throw new Error(`catalog product ${key} is missing`);
        }
        return product;
    }

    public async priceCentsOf(planKey: string, productKey: string): Promise<number> {
        const plan: GlobalPlan = await this.planOf(planKey);
        const product: GlobalProduct = await this.productOf(productKey);
        const price: number | null = await this.planProducts.priceCentsOf(plan.id, product.id);
        if (price === null) {
            throw new Error(`catalog price of ${productKey} in ${planKey} is missing`);
        }
        return price;
    }

    public async capabilitiesOf(planKey: string): Promise<PaidFeature[]> {
        const plan: GlobalPlan = await this.planOf(planKey);
        const granted: Set<string> = new Set(await this.planCapabilities.capabilitiesOf(plan.id));
        return PAID_FEATURES.filter((feature: PaidFeature): boolean => granted.has(feature));
    }

    public async limitsOf(planKey: string, productId: string, unit: string): Promise<GlobalProductLimit[]> {
        const plan: GlobalPlan = await this.planOf(planKey);
        return this.productLimits.listFor(plan.id, productId, unit);
    }

    private async planOf(key: string): Promise<GlobalPlan> {
        const plan: GlobalPlan | null = await this.plans.findByKey(key);
        if (plan === null) {
            throw new Error(`catalog plan ${key} is missing`);
        }
        return plan;
    }
}
