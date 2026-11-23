import { Insertable, Selectable } from 'kysely';
import { SignupEmailMarks, SignupLinks, SignupRedemptions } from '../../../core/database/generated/database.types';

export type SignupLink = Selectable<SignupLinks>;
export type NewSignupLink = Insertable<SignupLinks>;
export type SignupRedemption = Selectable<SignupRedemptions>;
export type NewSignupRedemption = Insertable<SignupRedemptions>;
export type SignupEmailMark = Selectable<SignupEmailMarks>;

export const REDEMPTION_SOURCES = {
    signup: 'signup',
    existingAccount: 'existing_account'
} as const;

export type RedemptionSource = (typeof REDEMPTION_SOURCES)[keyof typeof REDEMPTION_SOURCES];

export const REDEEM_REJECTIONS = {
    notOwner: 'not_owner',
    platformAccount: 'platform_account',
    alreadyRedeemed: 'already_redeemed',
    alreadyPaid: 'already_paid',
    trialUsed: 'trial_used'
} as const;

export type RedeemRejection = (typeof REDEEM_REJECTIONS)[keyof typeof REDEEM_REJECTIONS];

export interface RedeemSubject {
    readonly companyId: string;
    readonly userId: string;
    readonly email: string;
    readonly emailVerified: boolean;
    readonly isOwner: boolean;
    readonly ip: string | null;
}

export interface AccountHistory {
    readonly isPlatform: boolean;
    readonly everPremium: boolean;
    readonly trialUsed: boolean;
    readonly alreadyRedeemed: boolean;
}

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
    readonly offerValidityDays: number;
}

export interface LinkOfferPatch {
    readonly label?: string;
    readonly trial?: LinkTrial;
    readonly rules?: readonly DiscountRule[];
    readonly maxUses?: number | null;
    readonly expiresAt?: Date | null;
    readonly offerValidityDays?: number;
}

export const SIGNUP_LINK_LIMITS = {
    maxRules: 20,
    minPercent: 1,
    maxPercent: 90,
    minTrialDays: 1,
    maxTrialDays: 60,
    noCardMaxValidityDays: 90,
    minOfferValidityDays: 1,
    maxOfferValidityDays: 365,
    defaultOfferValidityDays: 30
} as const;
