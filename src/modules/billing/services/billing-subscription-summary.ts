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
import { withdrawalEndsAt } from '../domain/withdrawal';
import { BillingEnginePort } from '../ports/billing-engine.port';
import {
    OpenInvoiceSummary,
    SubscriptionSnapshot,
    SubscriptionStatus,
    SubscriptionSummary,
    SubscriptionSummaryPort
} from '../../plans/services/subscription-summary.port';

function iso(date: Date | null): string | null {
    return date === null ? null : date.toISOString();
}

function statusOf(subscription: BillingSubscription, standing: CompanyBillingStanding | null): SubscriptionStatus {
    if (standing?.status === STANDING_STATUSES.expired) {
        return 'expired';
    }
    if (subscription.status === SUBSCRIPTION_STATUSES.canceled) {
        return 'canceled';
    }
    if (subscription.status === SUBSCRIPTION_STATUSES.pending) {
        return 'pending';
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
        private readonly standings: CompanyBillingStandingDomain
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
            subscription: this.subscriptionOf(subscription, standing, open, now),
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
        const withdrawalEnd: Date | null = withdrawalEndsAt(subscription.firstPaidAt, this.config.BILLING_WITHDRAWAL_DAYS);
        return {
            status: statusOf(subscription, standing),
            method: subscription.paymentMethod === 'card' ? 'card' : 'pix',
            since: iso(subscription.firstPaidAt),
            paidThrough: iso(subscription.paidThrough),
            nextChargeAt: canceled ? null : iso(this.nextChargeOf(subscription, open)),
            card: subscription.cardLast4 === null ? null : { brand: subscription.cardBrand ?? '', last4: subscription.cardLast4 },
            graceEndsAt: iso(this.graceEndsAtOf(standing, open)),
            withdrawalEndsAt: iso(withdrawalEnd !== null && withdrawalEnd > now && !canceled ? withdrawalEnd : null),
            canResume: canceled && subscription.paidThrough !== null && now < subscription.paidThrough
        };
    }

    private nextChargeOf(subscription: BillingSubscription, open: BillingInvoice[]): Date | null {
        const due: Date | null = open[0]?.dueDate ?? null;
        if (due !== null) {
            return due;
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
