import { Selectable } from 'kysely';
import {
    CompanyCapabilities,
    CompanyProductLimits,
    CompanyProducts,
    GlobalPlans,
    GlobalProductLimits,
    GlobalProducts,
    PremiumEndedNotifications
} from '../../../core/database/generated/database.types';

export const PAID_FEATURES = ['ai', 'whatsapp', 'calendar'] as const;
export type PaidFeature = (typeof PAID_FEATURES)[number];

export const DEPLOYMENT_MODES = ['hosted', 'self_hosted'] as const;
export type DeploymentMode = (typeof DEPLOYMENT_MODES)[number];

export type PlanKey = 'free' | 'premium';
export type EffectivePlan = PlanKey | 'self_hosted';

export const FEATURE_STATES = {
    available: 'available',
    premiumRequired: 'premium_required',
    paused: 'paused',
    disabled: 'disabled'
} as const;
export type FeatureState = (typeof FEATURE_STATES)[keyof typeof FEATURE_STATES];

export const PRODUCT_KEYS = { premium: 'premium', paidUsage: 'paid_usage' } as const;
export type ProductKey = (typeof PRODUCT_KEYS)[keyof typeof PRODUCT_KEYS];

export const USAGE_UNITS = { costMicros: 'cost_micros' } as const;

export const PLAN_KEYS = { free: 'free', premium: 'premium' } as const;

export type ContractEndReason = 'canceled' | 'expired' | 'refunded' | 'account_deleted' | 'trial_ended';
export type ContractSource = 'subscription' | 'manual' | 'trial';

export const TRIAL_NOTICE_DAYS: number = 3;
export const TRIAL_KINDS = { noCard: 'no_card' } as const;
export type TrialKind = (typeof TRIAL_KINDS)[keyof typeof TRIAL_KINDS];

export const NOTIFICATION_STATUSES = { pending: 'pending', done: 'done', failed: 'failed' } as const;
export const MAX_NOTIFICATION_ATTEMPTS: number = 10;

export type GlobalPlan = Selectable<GlobalPlans>;
export type GlobalProduct = Selectable<GlobalProducts>;
export type GlobalProductLimit = Selectable<GlobalProductLimits>;
export type CompanyProduct = Selectable<CompanyProducts>;
export type CompanyProductLimit = Selectable<CompanyProductLimits>;
export type CompanyCapability = Selectable<CompanyCapabilities>;
export type PremiumEndedNotification = Selectable<PremiumEndedNotifications>;

export interface LimitRow {
    readonly quantity: string;
    readonly startsAt: Date;
    readonly endsAt: Date | null;
}

export interface OpenPremiumInput {
    readonly startsAt: Date;
    readonly subscriptionId: string;
}

export interface OpenTrialInput {
    readonly startsAt: Date;
    readonly days: number;
}

export interface TrialSnapshot {
    readonly kind: TrialKind;
    readonly endsAt: string;
    readonly daysLeft: number;
}

export interface ClosePremiumInput {
    readonly endsAt: Date;
    readonly reason: ContractEndReason;
}

export type SubscriptionStatus = 'pending' | 'active' | 'past_due' | 'canceled' | 'expired';

export interface SubscriptionSummary {
    readonly status: SubscriptionStatus;
    readonly method: 'card' | 'pix';
    readonly since: string | null;
    readonly paidThrough: string | null;
    readonly nextChargeAt: string | null;
    readonly card: { readonly brand: string; readonly last4: string } | null;
    readonly graceEndsAt: string | null;
    readonly withdrawalEndsAt: string | null;
    readonly canResume: boolean;
}

export interface OpenInvoiceSummary {
    readonly id: string;
    readonly status: 'issued' | 'overdue';
    readonly totalCents: number;
    readonly dueDate: string;
}

export interface SubscriptionSnapshot {
    readonly subscription: SubscriptionSummary;
    readonly openInvoice: OpenInvoiceSummary | null;
}

export type UsageStateKey = 'ok' | 'warning' | 'paused';

export interface PaidUsageSnapshot {
    readonly usedBps: number;
    readonly state: UsageStateKey;
    readonly resetsAt: string;
    readonly byFeature: { readonly ai: { readonly usedBps: number }; readonly whatsapp: { readonly usedBps: number } };
}

export type GateOutcome = 'allowed' | 'denied';
