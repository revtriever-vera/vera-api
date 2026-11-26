import { Selectable } from 'kysely';
import { MonthlyReviews } from '../../../core/database/generated/database.types';

export type MonthlyReviewRow = Selectable<MonthlyReviews>;

export const INCOME_SOURCES = { operations: 'operations', ledger: 'ledger' } as const;
export type IncomeSource = (typeof INCOME_SOURCES)[keyof typeof INCOME_SOURCES];

export const COVERAGE_REASONS = {
    noOperations: 'no_operations',
    noPreviousSnapshot: 'no_previous_snapshot',
    classesNotClosing: 'classes_not_closing',
    noBase: 'no_base'
} as const;
export type CoverageReason = (typeof COVERAGE_REASONS)[keyof typeof COVERAGE_REASONS];

export const CLASS_REASONS = {
    quantityMismatch: 'quantity_mismatch',
    fixedIncomeFlowUnknown: 'fixed_income_flow_unknown',
    assetWithoutSnapshot: 'asset_without_snapshot',
    unconvertibleFlow: 'unconvertible_flow',
    noBase: 'no_base'
} as const;
export type ClassReason = (typeof CLASS_REASONS)[keyof typeof CLASS_REASONS];

export const BENCHMARK_STATES = { ok: 'ok', notConfigured: 'not_configured', noData: 'no_data' } as const;
export type BenchmarkState = (typeof BENCHMARK_STATES)[keyof typeof BENCHMARK_STATES];

export const OPERATION_KIND_NAMES = {
    buy: 'buy',
    sell: 'sell',
    split: 'split',
    reverseSplit: 'reverse_split',
    bonus: 'bonus',
    income: 'income'
} as const;

export interface ReviewOperation {
    readonly assetId: string;
    readonly kind: string;
    readonly tradeDate: string;
    readonly settlementDate: string | null;
    readonly quantity: string;
    readonly grossMinor: number;
    readonly feesMinor: number;
    readonly withheldTaxMinor: number | null;
    readonly currency: string;
    readonly grossBrlMinor: number | null;
    readonly appliedToPosition: boolean;
}

export interface ReviewLedgerEntry {
    readonly assetId: string;
    readonly amountMinor: number;
    readonly currency: string;
}

export interface ClassReturn {
    readonly classId: string | null;
    readonly startMinor: number;
    readonly endMinor: number;
    readonly returnPct?: number;
    readonly reason?: ClassReason;
}

export interface ReturnsResult {
    readonly returnPct?: number;
    readonly byClass: readonly ClassReturn[];
    readonly reason: CoverageReason | null;
}

export interface IncomeResult {
    readonly amountMinor: number;
    readonly source: IncomeSource;
}

export interface PriceMove {
    readonly assetId: string;
    readonly variationPct: number;
}
