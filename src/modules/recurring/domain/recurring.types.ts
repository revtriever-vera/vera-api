export const CADENCES = {
    weekly: 'weekly',
    biweekly: 'biweekly',
    monthly: 'monthly',
    bimonthly: 'bimonthly',
    quarterly: 'quarterly',
    semiannual: 'semiannual',
    annual: 'annual'
} as const;

export type Cadence = (typeof CADENCES)[keyof typeof CADENCES];

export const VALUE_MODES = {
    fixed: 'fixed',
    variable: 'variable'
} as const;

export type ValueMode = (typeof VALUE_MODES)[keyof typeof VALUE_MODES];

export type DetectorCategoryKind = 'expense' | 'income' | 'transfer';

export const WINDOW_DAYS: number = 400;
export const BAND_TOLERANCE: number = 0.2;
export const DUPLICATE_MAX_DAYS: number = 3;
export const DUPLICATE_VALUE_TOLERANCE: number = 0.05;
export const CROSS_ACCOUNT_VALUE_TOLERANCE: number = 0.15;
export const MIRROR_MAX_DAYS: number = 1;
export const REFUND_MAX_DAYS: number = 15;
export const REFUND_VALUE_TOLERANCE: number = 0.01;
export const MERCHANT_KEY_MIN_LENGTH: number = 3;
export const CADENCE_COVERAGE: number = 0.75;
export const FIXED_ABSOLUTE_TOLERANCE_MINOR: number = 200;
export const FIXED_RELATIVE_TOLERANCE: number = 0.05;
export const VARIABLE_TOLERANCE: number = 0.35;
export const DAY_TOLERANCE: number = 4;
export const DAY_REANCHOR_GAP: number = 3;
export const TRIAL_MAX_MINOR: number = 100;
export const TRIAL_LOOKBACK_DAYS: number = 45;
export const SUBSCRIPTIONS_CATEGORY: string = 'subscriptions';
export const CONSUMPTION_CATEGORIES: readonly string[] = ['groceries', 'eating_out', 'transport', 'shopping'];

export interface DetectorTransaction {
    readonly id: string;
    readonly accountId: string;
    readonly date: string;
    readonly amountMinor: number;
    readonly normalizedDescription: string;
    readonly counterpartyKey: string | null;
    readonly categoryKey: string | null;
    readonly categoryKind: DetectorCategoryKind | null;
    readonly dictionaryPattern: string | null;
    readonly dictionaryCategory: string | null;
    readonly installmentTotal: number | null;
    readonly isSample: boolean;
}

export interface DayChange {
    readonly fromDay: number;
    readonly toDay: number;
}

export interface DetectedSeries {
    readonly merchantKey: string;
    readonly cadence: Cadence;
    readonly valueMode: ValueMode;
    readonly typicalAmountMinor: number;
    readonly minAmountMinor: number;
    readonly maxAmountMinor: number;
    readonly expectedDay: number | null;
    readonly dayChange: DayChange | null;
    readonly chargeIds: readonly string[];
    readonly duplicateChargeIds: readonly string[];
    readonly trialChargeIds: readonly string[];
    readonly accountId: string;
    readonly accountIds: readonly string[];
    readonly categoryKey: string | null;
    readonly knownSubscription: boolean;
    readonly pixToPerson: boolean;
    readonly firstDate: string;
    readonly lastDate: string;
}
