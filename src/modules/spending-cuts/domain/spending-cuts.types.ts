export const CUT_STATUSES = {
    noData: 'no_data',
    noIncome: 'no_income',
    goalMet: 'goal_met',
    cutSuggested: 'cut_suggested',
    exceedsFlexible: 'exceeds_flexible'
} as const;

export type CutStatus = (typeof CUT_STATUSES)[keyof typeof CUT_STATUSES];

export const MAX_GOAL_BPS: number = 9000;
export const MIN_COUNTED_CUT_MINOR: number = 100;
export const BPS_BASE: number = 10_000;

export interface CutCandidate {
    readonly key: string;
    readonly tieKey: string;
    readonly spentMinor: number;
    readonly averageMinor: number | null;
}

export interface CutAllocation {
    readonly key: string;
    readonly excessMinor: number;
    readonly cutMinor: number;
}

export interface CutPlan {
    readonly totalCutMinor: number;
    readonly excessTotalMinor: number;
    readonly allocations: readonly CutAllocation[];
}

export interface CutSuggestion {
    readonly categoryId: string;
    readonly systemKey: string | null;
    readonly name: string | null;
    readonly icon: string;
    readonly spentMinor: number;
    readonly averageMinor: number | null;
    readonly excessMinor: number;
    readonly cutMinor: number;
    readonly limitMinor: number;
}

export interface CutsResult {
    readonly month: string;
    readonly limitMonth: string;
    readonly isPartial: boolean;
    readonly status: CutStatus;
    readonly goal: { readonly bps: number; readonly minor: number; readonly simulated: boolean };
    readonly incomeMinor: number;
    readonly savedMinor: number;
    readonly savingsRateBps: number | null;
    readonly gapMinor: number;
    readonly surplusMinor: number;
    readonly totalCutMinor: number;
    readonly flexibleTotalMinor: number;
    readonly excessTotalMinor: number;
    readonly categoriesWithCut: number;
    readonly uncategorizedMinor: number;
    readonly averageMonths: number;
    readonly suggestions: readonly CutSuggestion[];
}
