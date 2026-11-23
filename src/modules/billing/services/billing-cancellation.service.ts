import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PlanContractService, TrialContract } from '../../plans/services/plan-contract.service';
import { billingConfig } from '../config/billing.config';
import { NoSubscriptionError } from '../domain/billing-engine.errors';
import { BillingRefundRequestDomain } from '../domain/billing-refund-request.domain';
import { BillingSubscriptionDomain } from '../domain/billing-subscription.domain';
import {
    BillingSubscription,
    NOTIFICATION_KINDS,
    STANDING_REASONS,
    STANDING_STATUSES,
    SUBSCRIPTION_STATUSES
} from '../domain/billing.types';
import { CompanyBillingStandingDomain } from '../domain/company-billing-standing.domain';
import { isWithinWithdrawal } from '../domain/withdrawal';
import { BillingEnginePort } from '../ports/billing-engine.port';
import { BillingLogService } from './billing-log.service';
import { BillingMailerService } from './billing-mailer.service';

@Injectable()
export class BillingCancellationService {
    public constructor(
        @Inject(billingConfig.KEY) private readonly config: ConfigType<typeof billingConfig>,
        private readonly engine: BillingEnginePort,
        private readonly contracts: PlanContractService,
        private readonly subscriptions: BillingSubscriptionDomain,
        private readonly standings: CompanyBillingStandingDomain,
        private readonly refunds: BillingRefundRequestDomain,
        private readonly mailer: BillingMailerService,
        private readonly logs: BillingLogService
    ) {}

    public async cancel(): Promise<{ endedNow: boolean }> {
        const subscription: BillingSubscription | null = await this.subscriptions.findOpen(this.engine.engine);
        if (subscription?.status !== SUBSCRIPTION_STATUSES.active || subscription.engineSubscriptionId === null) {
            throw new NoSubscriptionError();
        }
        await this.engine.cancelSubscription(subscription.engineSubscriptionId, `vera-cancel-${subscription.id}`);
        const now: Date = new Date();
        const endsNow: boolean = isWithinWithdrawal(subscription.firstPaidAt, this.config.BILLING_WITHDRAWAL_DAYS, now);
        const canceled: BillingSubscription = (await this.subscriptions.cancel(subscription, now, endsNow)) ?? subscription;
        this.logs.subscription('canceled', canceled.id, canceled.paymentMethod);
        await this.afterCancel(canceled, endsNow, now);
        return { endedNow: endsNow };
    }

    private async afterCancel(subscription: BillingSubscription, endsNow: boolean, now: Date): Promise<void> {
        const trial: TrialContract | null = await this.contracts.trialOf('premium');
        if (trial?.subscriptionId === subscription.id) {
            await this.contracts.detachSubscription('premium');
        }
        if (!endsNow) {
            await this.mailer.notify({
                kind: NOTIFICATION_KINDS.canceled,
                subjectId: subscription.id,
                paidThrough: subscription.paidThrough
            });
            return;
        }
        await this.contracts.close('premium', { endsAt: now, reason: 'refunded' });
        await this.standings.replaceCurrent(STANDING_STATUSES.expired, STANDING_REASONS.refunded, now);
        if (await this.refunds.recordOnce(subscription.id, now)) {
            await this.mailer.notifyRefundRequested(subscription.companyId, subscription.id);
        }
        await this.mailer.notify({ kind: NOTIFICATION_KINDS.canceled, subjectId: subscription.id, paidThrough: now });
    }
}
