import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { PlanCatalogDomain } from '../domain/plan-catalog.domain';
import { PlanDomain } from '../domain/plan.domain';
import { CompanyProduct, GlobalProduct, PRODUCT_KEYS, TRIAL_NOTICE_DAYS } from '../domain/plans.types';
import { TRIAL_ENDED_TEMPLATE, TRIAL_ENDING_TEMPLATE } from '../templates/trial.templates';
import { PlanContractService } from './plan-contract.service';
import { PlansLogService } from './plans-log.service';
import { TrialNotifier } from './trial-notifier.service';

export type TrialOutcome = 'none' | 'noticed' | 'ended' | 'converted';

const SWEEP_BATCH: number = 500;

@Injectable()
export class TrialLifecycleService {
    public constructor(
        private readonly catalog: PlanCatalogDomain,
        private readonly plans: PlanDomain,
        private readonly contracts: PlanContractService,
        private readonly notifier: TrialNotifier,
        private readonly logs: PlansLogService
    ) {}

    public async due(now: Date): Promise<CompanyProduct[]> {
        return this.plans.trialsToProcess(now, DateUtil.addDays(now, TRIAL_NOTICE_DAYS), SWEEP_BATCH);
    }

    public async settle(companyId: string, now: Date): Promise<TrialOutcome> {
        const product: GlobalProduct = await this.catalog.productOf(PRODUCT_KEYS.premium);
        const line: CompanyProduct | null = await this.plans.openLineOf(product.id);
        if (line?.source !== 'trial' || line.trialEndsAt === null) {
            return 'none';
        }
        if (line.trialEndsAt <= now) {
            return this.finish(companyId, product, line, line.trialEndsAt);
        }
        return this.warn(companyId, product, line, line.trialEndsAt, now);
    }

    private async finish(companyId: string, product: GlobalProduct, line: CompanyProduct, endsAt: Date): Promise<TrialOutcome> {
        if (line.subscriptionId !== null) {
            const price: number = await this.contracts.priceCentsOf('premium');
            const converted: boolean = await this.plans.convertTrial(product.id, line.subscriptionId, price);
            return converted ? 'converted' : 'none';
        }
        const closed: boolean = await this.contracts.close('premium', { endsAt, reason: 'trial_ended' });
        if (!closed) {
            return 'none';
        }
        await this.notifier.notify({ companyId, template: TRIAL_ENDED_TEMPLATE, endsAt });
        return 'ended';
    }

    private async warn(companyId: string, product: GlobalProduct, line: CompanyProduct, endsAt: Date, now: Date): Promise<TrialOutcome> {
        const inWindow: boolean = endsAt <= DateUtil.addDays(now, TRIAL_NOTICE_DAYS);
        if (!inWindow || line.subscriptionId !== null || line.trialNoticeSentAt !== null) {
            return 'none';
        }
        if (!(await this.plans.markTrialNoticeSent(product.id, now))) {
            return 'none';
        }
        await this.notifier.notify({ companyId, template: TRIAL_ENDING_TEMPLATE, endsAt });
        this.logs.trialNoticed();
        return 'noticed';
    }
}
