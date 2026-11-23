import { Injectable } from '@nestjs/common';
import { PlanCatalogDomain } from '../domain/plan-catalog.domain';
import { PlanDomain } from '../domain/plan.domain';
import { ClosePremiumInput, GlobalProduct, OpenPremiumInput, PRODUCT_KEYS } from '../domain/plans.types';
import { PlansLogService } from './plans-log.service';
import { PremiumEndedService } from './premium-ended.service';

@Injectable()
export class PlanContractService {
    public constructor(
        private readonly catalog: PlanCatalogDomain,
        private readonly plans: PlanDomain,
        private readonly ended: PremiumEndedService,
        private readonly logs: PlansLogService
    ) {}

    public async open(_product: 'premium', input: OpenPremiumInput): Promise<void> {
        const product: GlobalProduct = await this.catalog.productOf(PRODUCT_KEYS.premium);
        const priceCents: number = await this.catalog.priceCentsOf('premium', PRODUCT_KEYS.premium);
        const created: boolean = await this.plans.open(product.id, priceCents, input.startsAt, 'subscription', input.subscriptionId);
        if (created) {
            this.logs.contractOpened(PRODUCT_KEYS.premium);
        }
    }

    public async close(_product: 'premium', input: ClosePremiumInput): Promise<void> {
        const product: GlobalProduct = await this.catalog.productOf(PRODUCT_KEYS.premium);
        const closed: boolean = await this.plans.close(product.id, input.endsAt, input.reason);
        if (!closed) {
            return;
        }
        this.logs.contractClosed(PRODUCT_KEYS.premium, input.reason);
        await this.ended.notify(input.endsAt);
    }

    public async priceCentsOf(_product: 'premium'): Promise<number> {
        return this.catalog.priceCentsOf('premium', PRODUCT_KEYS.premium);
    }
}
