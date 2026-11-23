import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { plansConfig } from '../config/plans.config';
import { PlanCatalogDomain } from '../domain/plan-catalog.domain';
import { PlanDomain } from '../domain/plan.domain';
import { PlanUnavailableError } from '../domain/plans.errors';
import { CompanyCapability, CompanyProduct, DeploymentMode, EffectivePlan, PRODUCT_KEYS, PaidFeature } from '../domain/plans.types';

@Injectable()
export class PlanResolverService {
    public constructor(
        @Inject(plansConfig.KEY) private readonly config: ConfigType<typeof plansConfig>,
        private readonly catalog: PlanCatalogDomain,
        private readonly plans: PlanDomain
    ) {}

    public mode(): DeploymentMode {
        return this.config.DEPLOYMENT_MODE;
    }

    public async planOf(): Promise<EffectivePlan> {
        try {
            return await this.readPlan();
        } catch (error: unknown) {
            throw new PlanUnavailableError(error);
        }
    }

    public async capabilities(): Promise<PaidFeature[]> {
        try {
            const plan: EffectivePlan = await this.readPlan();
            const planCapabilities: PaidFeature[] = plan === 'premium' ? await this.catalog.capabilitiesOf('premium') : [];
            const manual: CompanyCapability[] = await this.plans.manualCapabilities();
            return PlanDomain.capabilitiesFor(plan, planCapabilities, manual);
        } catch (error: unknown) {
            throw new PlanUnavailableError(error);
        }
    }

    private async readPlan(): Promise<EffectivePlan> {
        if (this.mode() === 'self_hosted') {
            return PlanDomain.effectivePlanOf(null, 'self_hosted');
        }
        const product: { id: string } = await this.catalog.productOf(PRODUCT_KEYS.premium);
        const line: CompanyProduct | null = await this.plans.openLineOf(product.id);
        return PlanDomain.effectivePlanOf(line, 'hosted');
    }
}
