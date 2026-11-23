import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { PlanContractService } from '../../plans/services/plan-contract.service';
import { billingConfig } from '../config/billing.config';
import { BillingInvoiceDomain } from '../domain/billing-invoice.domain';
import { BillingSubscriptionDomain } from '../domain/billing-subscription.domain';
import {
    BillingInvoice,
    BillingSubscription,
    CompanyBillingStanding,
    STANDING_REASONS,
    STANDING_STATUSES,
    NOTIFICATION_KINDS
} from '../domain/billing.types';
import { CompanyBillingStandingDomain } from '../domain/company-billing-standing.domain';
import {
    graceEndOf,
    oldestOverdueInvoice,
    overdueSinceOfInvoice,
    StandingDecision,
    standingTransitionOf
} from '../domain/company-billing-standing.rules';
import { BillingEnginePort } from '../ports/billing-engine.port';
import { BillingLogService } from './billing-log.service';
import { BillingMailerService } from './billing-mailer.service';

@Injectable()
export class BillingStandingService {
    public constructor(
        @Inject(billingConfig.KEY) private readonly config: ConfigType<typeof billingConfig>,
        private readonly engine: BillingEnginePort,
        private readonly subscriptions: BillingSubscriptionDomain,
        private readonly invoices: BillingInvoiceDomain,
        private readonly standings: CompanyBillingStandingDomain,
        private readonly contracts: PlanContractService,
        private readonly mailer: BillingMailerService,
        private readonly logs: BillingLogService
    ) {}

    @AsCompany()
    public async recomputeFor(_companyId: string, now: Date): Promise<StandingDecision | null> {
        return this.recompute(now);
    }

    public async recompute(now: Date): Promise<StandingDecision | null> {
        const subscription: BillingSubscription | null = await this.subscriptions.findCurrent(this.engine.engine);
        if (subscription === null) {
            return null;
        }
        const open: BillingInvoice[] = await this.invoices.listOpen();
        const decision: StandingDecision = standingTransitionOf(open, subscription, now, this.config.BILLING_GRACE_DAYS);
        const current: CompanyBillingStanding | null = await this.standings.current();
        if (current === null && decision.status === STANDING_STATUSES.active) {
            await this.standings.replaceCurrent(decision.status, decision.reason, now);
            return decision;
        }
        if (current?.status === decision.status) {
            return decision;
        }
        await this.standings.replaceCurrent(decision.status, decision.reason, now);
        await this.react(decision, subscription, open, now);
        return decision;
    }

    private async react(decision: StandingDecision, subscription: BillingSubscription, open: BillingInvoice[], now: Date): Promise<void> {
        if (decision.status === STANDING_STATUSES.pastDue) {
            await this.warnPastDue(subscription, open);
            return;
        }
        if (decision.status === STANDING_STATUSES.expired) {
            await this.end(decision, subscription, now);
        }
    }

    private async warnPastDue(subscription: BillingSubscription, open: BillingInvoice[]): Promise<void> {
        const oldest: BillingInvoice | null = oldestOverdueInvoice(open);
        const since: Date | null = oldest === null ? null : overdueSinceOfInvoice(oldest);
        const graceEndsAt: Date | null = since === null ? null : graceEndOf(since, this.config.BILLING_GRACE_DAYS);
        this.logs.subscription('past_due', subscription.id, subscription.paymentMethod);
        await this.mailer.notify({ kind: NOTIFICATION_KINDS.pastDue, subjectId: oldest?.id ?? subscription.id, graceEndsAt });
    }

    private async end(decision: StandingDecision, subscription: BillingSubscription, now: Date): Promise<void> {
        const endsAt: Date = decision.reason === STANDING_REASONS.canceledPeriodEnded ? (subscription.paidThrough ?? now) : now;
        const closed: boolean = await this.contracts.close('premium', {
            endsAt,
            reason: decision.reason === STANDING_REASONS.canceledPeriodEnded ? 'canceled' : 'expired'
        });
        this.logs.subscription('ended', subscription.id, subscription.paymentMethod);
        if (closed) {
            await this.mailer.notify({ kind: NOTIFICATION_KINDS.ended, subjectId: `${subscription.id}-${endsAt.toISOString()}` });
        }
    }
}
