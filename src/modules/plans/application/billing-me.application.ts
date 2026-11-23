import { Injectable, Optional } from '@nestjs/common';
import { CurrentUserService } from '../../identity/services/current-user.service';
import { hasRole } from '../../identity/services/role-rank';
import { EffectivePlan, FeatureState, PaidFeature, PaidUsageSnapshot, SubscriptionSnapshot } from '../domain/plans.types';
import { PaidUsageReader } from '../services/paid-usage-reader.service';
import { PlanContractService } from '../services/plan-contract.service';
import { PlanGateService } from '../services/plan-gate.service';
import { PlanLimitService } from '../services/plan-limit.service';
import { SubscriptionSummaryPort } from '../services/subscription-summary.port';
import { BillingMe } from '../validation/billing-me.schemas';

@Injectable()
export class BillingMeApplication {
    public constructor(
        private readonly currentUser: CurrentUserService,
        private readonly gate: PlanGateService,
        private readonly contract: PlanContractService,
        private readonly limits: PlanLimitService,
        private readonly usage: PaidUsageReader,
        @Optional() private readonly summary: SubscriptionSummaryPort | undefined
    ) {}

    public async get(): Promise<BillingMe> {
        const plan: EffectivePlan = await this.gate.planOf();
        const hosted: boolean = this.gate.mode() === 'hosted';
        const snapshot: SubscriptionSnapshot | null = (await this.summary?.summary()) ?? null;
        return {
            mode: this.gate.mode(),
            plan,
            canManage: hasRole((await this.currentUser.require()).role, 'owner'),
            methods: hosted ? ['card', 'pix'] : [],
            priceCents: hosted ? await this.contract.priceCentsOf('premium') : null,
            currency: 'BRL',
            subscription: snapshot?.subscription ?? null,
            openInvoice: snapshot?.openInvoice ?? null,
            features: await this.features(),
            usage: await this.usageBlock(hosted)
        };
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
