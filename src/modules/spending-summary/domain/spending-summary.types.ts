import { Insertable, Selectable } from 'kysely';
import { SpendingSettings } from '../../../core/database/generated/database.types';

export type SpendingSettingsRow = Selectable<SpendingSettings>;
export type NewSpendingSettings = Insertable<SpendingSettings>;

export const INCOME_MODES = {
    transactions: 'transactions',
    declared: 'declared'
} as const;

export type IncomeMode = (typeof INCOME_MODES)[keyof typeof INCOME_MODES];

export const CATEGORY_KINDS = {
    expense: 'expense',
    income: 'income',
    transfer: 'transfer'
} as const;

export const FLEXIBILITIES = {
    fixed: 'fixed',
    flexible: 'flexible'
} as const;

export type SummaryFlexibility = (typeof FLEXIBILITIES)[keyof typeof FLEXIBILITIES];

export const DEFAULT_SAVINGS_GOAL_BPS: number = 2000;
export const MAX_SAVINGS_GOAL_BPS: number = 9000;
export const MAX_DECLARED_INCOME_MINOR: number = 1_000_000_000_000;
export const AVERAGE_WINDOW_MONTHS: number = 3;
export const MAX_AVAILABLE_MONTHS: number = 24;
export const FIRST_SUPPORTED_MONTH: string = '2000-01';
export const SUMMARY_CURRENCY = 'BRL' as const;
export const BPS_BASE: number = 10_000;

export interface SpendingSettingsView {
    readonly incomeMode: IncomeMode;
    readonly savingsGoalBps: number;
    readonly declaredIncomeMinor: number | null;
}

export interface SummaryCategoryRow {
    readonly categoryId: string;
    readonly systemKey: string | null;
    readonly name: string | null;
    readonly icon: string;
    readonly flexibility: SummaryFlexibility | null;
    readonly spentMinor: number;
    readonly averageMinor: number | null;
    readonly deltaBps: number | null;
    readonly isNew: boolean;
    readonly transactionCount: number;
}

export interface MonthlySummary {
    readonly month: string;
    readonly isPartial: boolean;
    readonly hasData: boolean;
    readonly currency: 'BRL';
    readonly previousMonth: string | null;
    readonly nextMonth: string | null;
    readonly availableMonths: readonly string[];
    readonly income: {
        readonly minor: number;
        readonly mode: IncomeMode;
        readonly fromTransactionsMinor: number;
    };
    readonly expensesMinor: number;
    readonly uncategorizedMinor: number;
    readonly uncategorizedCount: number;
    readonly uncategorizedInflowMinor: number;
    readonly savedMinor: number;
    readonly savingsRateBps: number | null;
    readonly goal: { readonly bps: number; readonly minor: number };
    readonly gapMinor: number;
    readonly fixedMinor: number;
    readonly fixedShareBps: number | null;
    readonly flexibleMinor: number;
    readonly transfersOutMinor: number;
    readonly averageMonths: number;
    readonly excludedCurrencyCount: number;
    readonly categories: readonly SummaryCategoryRow[];
    readonly incomeCategories: readonly SummaryCategoryRow[];
}

export interface CategoryInfo {
    readonly id: string;
    readonly systemKey: string | null;
    readonly name: string | null;
    readonly icon: string;
    readonly kind: string;
    readonly flexibility: string | null;
    readonly position: number;
}

export interface CategoryMonthNet {
    readonly month: string;
    readonly categoryId: string | null;
    readonly netMinor: number;
    readonly outflowMinor: number;
    readonly outflowCount: number;
    readonly transactionCount: number;
}

export interface SummaryInput {
    readonly month: string;
    readonly isPartial: boolean;
    readonly nets: readonly CategoryMonthNet[];
    readonly monthsWithData: readonly string[];
    readonly categories: readonly CategoryInfo[];
    readonly settings: SpendingSettingsView;
    readonly excludedCurrencyCount: number;
    readonly navigation: {
        readonly previousMonth: string | null;
        readonly nextMonth: string | null;
    };
}

export interface CategoryAverage {
    readonly averageMinor: number | null;
    readonly deltaBps: number | null;
    readonly isNew: boolean;
}
