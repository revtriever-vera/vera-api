import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { billingConfig } from '../config/billing.config';
import { BillingInvoiceDomain } from '../domain/billing-invoice.domain';
import { BillingSubscriptionDomain } from '../domain/billing-subscription.domain';
import {
    BillingInvoice,
    BillingSubscription,
    CompanyBillingStanding,
    STANDING_STATUSES,
    SUBSCRIPTION_STATUSES
} from '../domain/billing.types';
import { CompanyBillingStandingDomain } from '../domain/company-billing-standing.domain';
import { graceEndOf, oldestOverdueInvoice, overdueSinceOfInvoice } from '../domain/company-billing-standing.rules';
import { resumableUntilOf } from '../domain/billing-trial.rules';
import { withdrawalEndsAt } from '../domain/withdrawal';
import { discountViewOf, DiscountView, resolvePrice } from '../domain/billing-price.rules';
import { BillingPriceQuoteDomain } from '../domain/billing-price-quote.domain';
import { discountRulesSchema } from '../validation/billing-discount.schemas';
import { PlanContractService } from '../../plans/services/plan-contract.service';
import { BillingEnginePort } from '../ports/billing-engine.port';
import {
    OpenInvoiceSummary,
    SubscriptionSnapshot,
    SubscriptionStatus,
    SubscriptionSummary,
    SubscriptionSummaryPort
} from '../../plans/services/subscription-summary.port';
import { BillingOfferRule } from '../../plans/services/billing-offer.port';

function iso(date: Date | null): string | null {
    return date === null ? null : date.toISOString();
}

function trialRunning(subscription: BillingSubscription, standing: CompanyBillingStanding | null, now: Date): boolean {
    return standing?.status === STANDING_STATUSES.trialing && subscription.trialEndsAt !== null && now < subscription.trialEndsAt;
}

function statusOf(subscription: BillingSubscription, standing: CompanyBillingStanding | null, now: Date): SubscriptionStatus {
    if (standing?.status === STANDING_STATUSES.expired) {
        return 'expired';
    }
    if (subscription.status === SUBSCRIPTION_STATUSES.canceled) {
        return 'canceled';
    }
    if (subscription.status === SUBSCRIPTION_STATUSES.pending) {
        return 'pending';
    }
    if (trialRunning(subscription, standing, now)) {
        return 'trialing';
    }
    return standing?.status === STANDING_STATUSES.pastDue ? 'past_due' : 'active';
}

@Injectable()
export class BillingSubscriptionSummary extends SubscriptionSummaryPort {
    public constructor(
        @Inject(billingConfig.KEY) private readonly config: ConfigType<typeof billingConfig>,
        private readonly engine: BillingEnginePort,
        private readonly subscriptions: BillingSubscriptionDomain,
        private readonly invoices: BillingInvoiceDomain,
        private readonly standings: CompanyBillingStandingDomain,
        private readonly quotes: BillingPriceQuoteDomain,
        private readonly contracts: PlanContractService
    ) {
        super();
    }

    public async summary(): Promise<SubscriptionSnapshot | null> {
        const subscription: BillingSubscription | null = await this.subscriptions.findCurrent(this.engine.engine);
        if (subscription === null) {
            return null;
        }
        const open: BillingInvoice[] = await this.invoices.listOpen();
        const standing: CompanyBillingStanding | null = await this.standings.current();
        const now: Date = new Date();
        return {
            subscription: await this.withNextCharge(this.subscriptionOf(subscription, standing, open, now), subscription, open),
            openInvoice: this.openInvoiceOf(open)
        };
    }

    private subscriptionOf(
        subscription: BillingSubscription,
        standing: CompanyBillingStanding | null,
        open: BillingInvoice[],
        now: Date
    ): SubscriptionSummary {
        const canceled: boolean = subscription.status === SUBSCRIPTION_STATUSES.canceled;
        const resumeLimit: Date | null = resumableUntilOf(subscription);
        const withdrawalEnd: Date | null = withdrawalEndsAt(subscription.firstPaidAt, this.config.BILLING_WITHDRAWAL_DAYS);
        return {
            status: statusOf(subscription, standing, now),
            method: subscription.paymentMethod === 'card' ? 'card' : 'pix',
            since: iso(subscription.firstPaidAt),
            paidThrough: iso(subscription.paidThrough),
            nextChargeAt: canceled ? null : iso(this.nextChargeOf(subscription, open)),
            card: subscription.cardLast4 === null ? null : { brand: subscription.cardBrand ?? '', last4: subscription.cardLast4 },
            graceEndsAt: iso(this.graceEndsAtOf(standing, open)),
            withdrawalEndsAt: iso(withdrawalEnd !== null && withdrawalEnd > now && !canceled ? withdrawalEnd : null),
            canResume: canceled && resumeLimit !== null && now < resumeLimit,
            discount: null,
            nextChargeAmountMinor: null
        };
    }

    /** Same rule as the price endpoint (`resolvePrice`), for the cycle of the next charge: the one already quoted while its invoice is open, or the one after the last quoted. */
    private async withNextCharge(
        summary: SubscriptionSummary,
        subscription: BillingSubscription,
        open: BillingInvoice[]
    ): Promise<SubscriptionSummary> {
        if (summary.nextChargeAt === null) {
            return summary;
        }
        const lastQuoted: number = await this.quotes.lastCycleOf(subscription.id);
        const cycle: number = Math.max(1, open.length > 0 ? lastQuoted : lastQuoted + 1) + subscription.discountCycleOffset;
        const rules: BillingOfferRule[] = discountRulesSchema.parse(subscription.discountRules);
        const base: number = await this.contracts.priceCentsOf('premium');
        const view: DiscountView | null = discountViewOf(rules, cycle, new Date(summary.nextChargeAt));
        return {
            ...summary,
            discount: view === null ? null : { percent: view.percent, cycle: view.cycle, endsAt: view.endsAt.toISOString() },
            nextChargeAmountMinor: resolvePrice(base, rules, cycle).amountCents
        };
    }

    private nextChargeOf(subscription: BillingSubscription, open: BillingInvoice[]): Date | null {
        const due: Date | null = open[0]?.dueDate ?? null;
        if (due !== null) {
            return due;
        }
        if (subscription.trialEndsAt !== null && subscription.firstPaidAt === null) {
            return subscription.trialEndsAt;
        }
        if (subscription.paidThrough !== null) {
            return subscription.paidThrough;
        }
        return subscription.firstChargeDate === null ? null : new Date(`${subscription.firstChargeDate}T00:00:00Z`);
    }

    private graceEndsAtOf(standing: CompanyBillingStanding | null, open: BillingInvoice[]): Date | null {
        if (standing?.status !== STANDING_STATUSES.pastDue) {
            return null;
        }
        const oldest: BillingInvoice | null = oldestOverdueInvoice(open);
        const since: Date | null = oldest === null ? null : overdueSinceOfInvoice(oldest);
        return since === null ? null : graceEndOf(since, this.config.BILLING_GRACE_DAYS);
    }

    private openInvoiceOf(open: BillingInvoice[]): OpenInvoiceSummary | null {
        const oldest: BillingInvoice | undefined = open.find(
            (invoice: BillingInvoice): boolean => invoice.totalCents !== null && invoice.dueDate !== null
        );
        const total: string | null = oldest?.totalCents ?? null;
        const dueDate: Date | null = oldest?.dueDate ?? null;
        if (oldest === undefined || total === null || dueDate === null) {
            return null;
        }
        return {
            id: oldest.id,
            status: oldest.status === 'overdue' ? 'overdue' : 'issued',
            totalCents: Number(total),
            dueDate: dueDate.toISOString()
        };
    }
}
