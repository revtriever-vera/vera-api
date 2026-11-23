export interface BillingOfferRule {
    readonly percent: number;
    readonly fromCycle: number;
    readonly toCycle: number;
}

export interface BillingOfferSnapshot {
    readonly trial: { readonly kind: 'none' | 'card' | 'no_card'; readonly days: number | null };
    readonly rules: BillingOfferRule[];
    readonly redeemedAt: string;
    readonly expiresAt: string;
}

export interface UsableOffer {
    readonly rules: BillingOfferRule[];
    readonly cardTrialDays: number | null;
}

export abstract class BillingOfferPort {
    public abstract offer(): Promise<BillingOfferSnapshot | null>;
    public abstract trialStarted(at: Date): Promise<void>;
    public abstract usable(): Promise<UsableOffer | null>;
    public abstract markApplied(): Promise<boolean>;
    public abstract release(): Promise<void>;
}
