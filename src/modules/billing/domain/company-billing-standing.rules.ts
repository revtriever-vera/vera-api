import { DateUtil } from '../../../shared/utils/date.util';
import {
    BillingInvoice,
    BillingSubscription,
    INVOICE_STATUSES,
    STANDING_REASONS,
    STANDING_STATUSES,
    StandingReason,
    StandingStatus,
    SUBSCRIPTION_STATUSES
} from './billing.types';

export interface StandingDecision {
    readonly status: StandingStatus;
    readonly reason: StandingReason;
}

function overdueSinceOf(invoice: BillingInvoice): Date | null {
    return invoice.overdueAt ?? invoice.dueDate;
}

export function oldestOverdueInvoice(invoices: readonly BillingInvoice[]): BillingInvoice | null {
    const overdue: BillingInvoice[] = invoices.filter(
        (invoice: BillingInvoice): boolean => invoice.status === INVOICE_STATUSES.overdue && overdueSinceOf(invoice) !== null
    );
    if (overdue.length === 0) {
        return null;
    }
    const sorted: BillingInvoice[] = [...overdue].sort(
        (left: BillingInvoice, right: BillingInvoice): number =>
            (overdueSinceOf(left)?.getTime() ?? 0) - (overdueSinceOf(right)?.getTime() ?? 0)
    );
    return sorted[0] ?? null;
}

export function overdueSinceOfInvoice(invoice: BillingInvoice): Date | null {
    return overdueSinceOf(invoice);
}

export function graceEndOf(overdueSince: Date, graceDays: number): Date {
    return DateUtil.addDays(overdueSince, graceDays);
}

function canceledAndEnded(subscription: BillingSubscription | null, now: Date): boolean {
    return (
        subscription !== null &&
        subscription.status === SUBSCRIPTION_STATUSES.canceled &&
        subscription.paidThrough !== null &&
        now > subscription.paidThrough
    );
}

function isTrialSubscription(subscription: BillingSubscription | null): subscription is BillingSubscription & { trialEndsAt: Date } {
    return subscription !== null && subscription.trialEndsAt !== null && subscription.firstPaidAt === null;
}

function canceledTrialEnded(subscription: BillingSubscription | null, now: Date): boolean {
    return (
        isTrialSubscription(subscription) &&
        subscription.status === SUBSCRIPTION_STATUSES.canceled &&
        subscription.trialStartedAt !== null &&
        subscription.paidThrough === null &&
        now >= subscription.trialEndsAt
    );
}

function trialRunning(subscription: BillingSubscription | null, now: Date): boolean {
    return isTrialSubscription(subscription) && subscription.trialStartedAt !== null && now < subscription.trialEndsAt;
}

export function standingTransitionOf(
    invoices: readonly BillingInvoice[],
    subscription: BillingSubscription | null,
    now: Date,
    graceDays: number
): StandingDecision {
    if (canceledAndEnded(subscription, now)) {
        return { status: STANDING_STATUSES.expired, reason: STANDING_REASONS.canceledPeriodEnded };
    }
    if (canceledTrialEnded(subscription, now)) {
        return { status: STANDING_STATUSES.expired, reason: STANDING_REASONS.trialCanceled };
    }
    const overdueSince: Date | null = overdueSinceOfOldest(invoices);
    if (overdueSince === null && trialRunning(subscription, now)) {
        return { status: STANDING_STATUSES.trialing, reason: STANDING_REASONS.trialStarted };
    }
    if (overdueSince === null) {
        return { status: STANDING_STATUSES.active, reason: STANDING_REASONS.invoicePaid };
    }
    if (now >= graceEndOf(overdueSince, graceDays)) {
        return { status: STANDING_STATUSES.expired, reason: STANDING_REASONS.graceExpired };
    }
    return { status: STANDING_STATUSES.pastDue, reason: STANDING_REASONS.invoiceOverdue };
}

function overdueSinceOfOldest(invoices: readonly BillingInvoice[]): Date | null {
    const oldest: BillingInvoice | null = oldestOverdueInvoice(invoices);
    return oldest === null ? null : overdueSinceOf(oldest);
}
