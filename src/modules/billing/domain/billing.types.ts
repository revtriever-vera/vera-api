import { Selectable } from 'kysely';
import {
    BillingInvoices,
    BillingNotifications,
    BillingPendingCancellations,
    BillingPriceQuotes,
    BillingRefundRequests,
    BillingSubscriptions,
    CompanyBillingStandings,
    RevtrieverEventCursors,
    RevtrieverEvents
} from '../../../core/database/generated/database.types';
import type { BillingOfferRule } from '../../plans/services/billing-offer.port';
import { BillingEngine, PaymentMethod } from './billing-engine.types';

export type BillingSubscription = Selectable<BillingSubscriptions>;
export type BillingInvoice = Selectable<BillingInvoices>;
export type BillingPriceQuote = Selectable<BillingPriceQuotes>;
export type CompanyBillingStanding = Selectable<CompanyBillingStandings>;
export type BillingNotification = Selectable<BillingNotifications>;
export type BillingRefundRequest = Selectable<BillingRefundRequests>;
export type BillingPendingCancellation = Selectable<BillingPendingCancellations>;
export type RevtrieverEvent = Selectable<RevtrieverEvents>;
export type RevtrieverEventCursor = Selectable<RevtrieverEventCursors>;

export const SUBSCRIPTION_STATUSES = { pending: 'pending', active: 'active', failed: 'failed', canceled: 'canceled' } as const;
export type SubscriptionRowStatus = (typeof SUBSCRIPTION_STATUSES)[keyof typeof SUBSCRIPTION_STATUSES];

export const INVOICE_STATUSES = { issued: 'issued', overdue: 'overdue', paid: 'paid' } as const;
export type InvoiceRowStatus = (typeof INVOICE_STATUSES)[keyof typeof INVOICE_STATUSES];

export const EVENT_STATUSES = { received: 'received', processed: 'processed', ignored: 'ignored', failed: 'failed' } as const;
export type EventRowStatus = (typeof EVENT_STATUSES)[keyof typeof EVENT_STATUSES];

export const STANDING_STATUSES = { active: 'active', trialing: 'trialing', pastDue: 'past_due', expired: 'expired' } as const;
export type StandingStatus = (typeof STANDING_STATUSES)[keyof typeof STANDING_STATUSES];

export const STANDING_REASONS = {
    invoiceOverdue: 'invoice_overdue',
    graceExpired: 'grace_expired',
    invoicePaid: 'invoice_paid',
    canceledPeriodEnded: 'canceled_period_ended',
    refunded: 'refunded',
    trialStarted: 'trial_started',
    trialCanceled: 'trial_canceled'
} as const;
export type StandingReason = (typeof STANDING_REASONS)[keyof typeof STANDING_REASONS];

export const NOTIFICATION_KINDS = {
    activated: 'premium_activated',
    pastDue: 'premium_past_due',
    canceled: 'premium_canceled',
    ended: 'premium_ended',
    trialStarted: 'premium_trial_started',
    trialEnding: 'premium_trial_ending'
} as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[keyof typeof NOTIFICATION_KINDS];

export const EVENT_TYPES = {
    invoiceIssued: 'invoice.issued',
    invoiceOverdue: 'invoice.overdue',
    invoicePaid: 'invoice.paid',
    invoiceHeld: 'invoice.held',
    chargeFailed: 'charge.failed',
    subscriptionCanceled: 'subscription.canceled',
    subscriptionCardSaved: 'subscription.card_saved',
    pricingFailing: 'pricing.failing',
    pricingRecovered: 'pricing.recovered'
} as const;

export const EVENTS_CURSOR_SOURCE: string = 'revtriever-events';
export const CHARGE_FAILED_LOOKBACK_DAYS: number = 7;
export const PROVISIONING_STALE_MINUTES: number = 15;
export const EVENT_STALE_MINUTES: number = 10;
export const INVOICES_PAGE_SIZE: number = 12;
export const CAPTURE_SESSIONS_PER_HOUR: number = 5;
export const MAX_CHARGE_DAY: number = 28;
export const SWEEP_BATCH: number = 500;
export const CARD_CONFIRM_HOURS: number = 24;
export const TRIAL_ENDING_NOTICE_DAYS: number = 3;

export interface NewSubscriptionDraft {
    readonly engine: BillingEngine;
    readonly planId: string;
    readonly paymentMethod: PaymentMethod;
    readonly firstChargeDate: string | null;
    readonly trialEndsAt: Date | null;
    readonly discountRules: readonly BillingOfferRule[];
    readonly discountCycleOffset: number;
}

export interface InvoiceMirror {
    readonly engineInvoiceId: string;
    readonly status: InvoiceRowStatus;
    readonly totalCents: number | null;
    readonly method: PaymentMethod | null;
    readonly dueDate: Date | null;
    readonly cycleStart: Date | null;
    readonly cycleEnd: Date | null;
    readonly issuedAt: Date | null;
    readonly paidAt: Date | null;
    readonly overdueAt: Date | null;
}

export interface InvoicePage {
    readonly items: readonly BillingInvoice[];
    readonly page: number;
    readonly total: number;
}

export interface PriceQuoteDraft {
    readonly subscriptionId: string;
    readonly productRef: string;
    readonly cycle: number;
    readonly amountCents: number;
    readonly description: string;
}
