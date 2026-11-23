import { Insertable, Selectable } from 'kysely';
import { SignupLinks } from '../../../core/database/generated/database.types';

export type SignupLink = Selectable<SignupLinks>;
export type NewSignupLink = Insertable<SignupLinks>;

export const TRIAL_KINDS = {
    none: 'none',
    card: 'card',
    noCard: 'no_card'
} as const;

export type TrialKind = (typeof TRIAL_KINDS)[keyof typeof TRIAL_KINDS];

export const LINK_STATUSES = {
    active: 'active',
    revoked: 'revoked',
    expired: 'expired',
    exhausted: 'exhausted'
} as const;

export type LinkStatus = (typeof LINK_STATUSES)[keyof typeof LINK_STATUSES];

export interface DiscountRule {
    readonly percent: number;
    readonly fromCycle: number;
    readonly toCycle: number;
}

export interface LinkTrial {
    readonly kind: TrialKind;
    readonly days: number | null;
}

export interface LinkOfferInput {
    readonly label: string;
    readonly trial: LinkTrial;
    readonly rules: readonly DiscountRule[];
    readonly maxUses: number | null;
    readonly expiresAt: Date | null;
}

export const SIGNUP_LINK_LIMITS = {
    maxRules: 20,
    minPercent: 1,
    maxPercent: 90,
    minTrialDays: 1,
    maxTrialDays: 60,
    noCardMaxValidityDays: 90
} as const;
