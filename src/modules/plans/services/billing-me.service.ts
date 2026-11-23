import { Injectable } from '@nestjs/common';
import { CurrentUserService } from '../../identity/services/current-user.service';
import { hasRole } from '../../identity/services/role-rank';
import { DateUtil } from '../../../shared/utils/date.util';
import {
    EffectivePlan,
    FeatureState,
    PaidFeature,
    PaidUsageSnapshot,
    SubscriptionSnapshot,
    TRIAL_KINDS,
    TrialSnapshot
} from '../domain/plans.types';
import { BillingOfferRegistry } from './billing-offer.registry';
import { PaidUsageReader } from './paid-usage-reader.service';
import { CardTrialContract, PlanContractService, TrialContract } from './plan-contract.service';
import { PlanGateService } from './plan-gate.service';
import { PlanLimitService } from './plan-limit.service';
import { SubscriptionSummaryRegistry } from './subscription-summary.registry';
import { BillingMe } from '../validation/billing-me.schemas';

@Injectable()
export class BillingMeService {
    public constructor(
        private readonly currentUser: CurrentUserService,
        private readonly gate: PlanGateService,
        private readonly contract: PlanContractService,
        private readonly limits: PlanLimitService,
        private readonly usage: PaidUsageReader,
        private readonly offers: BillingOfferRegistry,
        private readonly summary: SubscriptionSummaryRegistry
    ) {}

    public async get(): Promise<BillingMe> {
        const plan: EffectivePlan = await this.gate.planOf();
        const hosted: boolean = this.gate.mode() === 'hosted';
        const snapshot: SubscriptionSnapshot | null = await this.summary.current();
        return {
            mode: this.gate.mode(),
            plan,
            canManage: hasRole((await this.currentUser.require()).role, 'owner'),
            methods: hosted ? ['card', 'pix'] : [],
            priceCents: hosted ? await this.contract.priceCentsOf('premium') : null,
            currency: 'BRL',
            subscription: snapshot?.subscription ?? null,
            openInvoice: snapshot?.openInvoice ?? null,
            trial: await this.trial(plan),
            offer: await this.offers.current(),
            features: await this.features(),
            usage: await this.usageBlock(hosted)
        };
    }

    private async trial(plan: EffectivePlan): Promise<TrialSnapshot | null> {
        if (plan !== 'premium') {
            return null;
        }
        const card: CardTrialContract | null = await this.contract.cardTrialOf('premium');
        if (card !== null) {
            return { kind: TRIAL_KINDS.card, endsAt: card.endsAt.toISOString(), daysLeft: DateUtil.daysLeftUntil(card.endsAt) };
        }
        const contract: TrialContract | null = await this.contract.trialOf('premium');
        if (contract === null) {
            return null;
        }
        return { kind: TRIAL_KINDS.noCard, endsAt: contract.endsAt.toISOString(), daysLeft: DateUtil.daysLeftUntil(contract.endsAt) };
    }

    private async features(): Promise<Record<PaidFeature, FeatureState>> {
        const [ai, whatsapp, calendar]: [FeatureState, FeatureState, FeatureState] = await Promise.all([
            this.gate.stateOf('ai'),
            this.gate.stateOf('whatsapp'),
            this.gate.stateOf('calendar')
        ]);
        return { ai, whatsapp, calendar };
    }

    private async usageBlock(hosted: boolean): Promise<BillingMe['usage']> {
        const snapshot: PaidUsageSnapshot | null = await this.usage.state();
        if (snapshot === null) {
            return null;
        }
        return { ...snapshot, capMicros: hosted ? null : await this.limits.capMicros() };
    }
}
