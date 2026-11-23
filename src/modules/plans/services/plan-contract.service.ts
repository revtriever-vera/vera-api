import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { DateUtil } from '../../../shared/utils/date.util';
import { CompanyTrialService } from '../../identity/services/company-trial.service';
import { PlanCatalogDomain } from '../domain/plan-catalog.domain';
import { PlanDomain } from '../domain/plan.domain';
import { BillingNotAvailableError, TrialAlreadyUsedError, TrialUnavailableError } from '../domain/plans.errors';
import { ClosePremiumInput, CompanyProduct, GlobalProduct, OpenPremiumInput, OpenTrialInput, PRODUCT_KEYS } from '../domain/plans.types';
import { PlanResolverService } from './plan-resolver.service';
import { PlansLogService } from './plans-log.service';
import { PremiumEndedService } from './premium-ended.service';

export interface TrialContract {
    readonly endsAt: Date;
    readonly subscriptionId: string | null;
}

@Injectable()
export class PlanContractService {
    public constructor(
        private readonly catalog: PlanCatalogDomain,
        private readonly plans: PlanDomain,
        private readonly ended: PremiumEndedService,
        private readonly resolver: PlanResolverService,
        private readonly trials: CompanyTrialService,
        private readonly logs: PlansLogService
    ) {}

    public async open(_product: 'premium', input: OpenPremiumInput): Promise<void> {
        const product: GlobalProduct = await this.catalog.productOf(PRODUCT_KEYS.premium);
        const priceCents: number = await this.catalog.priceCentsOf('premium', PRODUCT_KEYS.premium);
        const created: boolean = await this.plans.open(product.id, priceCents, input.startsAt, 'subscription', input.subscriptionId, null);
        if (created) {
            this.logs.contractOpened(PRODUCT_KEYS.premium);
        }
    }

    @UsingTransaction()
    public async openTrial(_product: 'premium', input: OpenTrialInput): Promise<void> {
        if (this.resolver.mode() === 'self_hosted') {
            throw new BillingNotAvailableError();
        }
        const product: GlobalProduct = await this.catalog.productOf(PRODUCT_KEYS.premium);
        if ((await this.plans.openLineOf(product.id)) !== null) {
            throw new TrialUnavailableError();
        }
        if (!(await this.trials.markStarted(input.startsAt))) {
            throw new TrialAlreadyUsedError();
        }
        const endsAt: Date = DateUtil.addDays(input.startsAt, input.days);
        await this.plans.open(product.id, 0, input.startsAt, 'trial', null, endsAt);
        this.logs.contractOpened(PRODUCT_KEYS.premium);
    }

    public async everHadPremium(): Promise<boolean> {
        const product: GlobalProduct = await this.catalog.productOf(PRODUCT_KEYS.premium);
        return this.plans.hasAnyLineOf(product.id);
    }

    public async trialOf(_product: 'premium'): Promise<TrialContract | null> {
        const product: GlobalProduct = await this.catalog.productOf(PRODUCT_KEYS.premium);
        const line: CompanyProduct | null = await this.plans.openLineOf(product.id);
        if (line?.source !== 'trial' || line.trialEndsAt === null) {
            return null;
        }
        return { endsAt: line.trialEndsAt, subscriptionId: line.subscriptionId };
    }

    public async attachSubscription(_product: 'premium', subscriptionId: string): Promise<boolean> {
        const product: GlobalProduct = await this.catalog.productOf(PRODUCT_KEYS.premium);
        return this.plans.attachSubscription(product.id, subscriptionId);
    }

    public async detachSubscription(_product: 'premium'): Promise<boolean> {
        const product: GlobalProduct = await this.catalog.productOf(PRODUCT_KEYS.premium);
        return this.plans.detachSubscription(product.id);
    }

    public async close(_product: 'premium', input: ClosePremiumInput): Promise<boolean> {
        const product: GlobalProduct = await this.catalog.productOf(PRODUCT_KEYS.premium);
        const closed: boolean = await this.plans.close(product.id, input.endsAt, input.reason);
        if (!closed) {
            return false;
        }
        this.logs.contractClosed(PRODUCT_KEYS.premium, input.reason);
        await this.ended.notify(input.endsAt);
        return true;
    }

    public async priceCentsOf(_product: 'premium'): Promise<number> {
        return this.catalog.priceCentsOf('premium', PRODUCT_KEYS.premium);
    }
}
