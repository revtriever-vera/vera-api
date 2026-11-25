import { Insertable, Selectable } from 'kysely';
import { InvestmentImports, InvestmentOperations } from '../../../core/database/generated/database.types';

export type InvestmentImport = Selectable<InvestmentImports>;
export type NewInvestmentImport = Insertable<InvestmentImports>;
export type InvestmentOperation = Selectable<InvestmentOperations>;
export type NewInvestmentOperation = Insertable<InvestmentOperations>;

export const IMPORT_SOURCES = { b3: 'b3', cryptoCsv: 'crypto_csv', model: 'model' } as const;
export type ImportSource = (typeof IMPORT_SOURCES)[keyof typeof IMPORT_SOURCES];

export const IMPORT_STATUSES = { completed: 'completed', undone: 'undone' } as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[keyof typeof IMPORT_STATUSES];

export const OPERATION_KINDS = {
    buy: 'buy',
    sell: 'sell',
    split: 'split',
    reverseSplit: 'reverse_split',
    bonus: 'bonus',
    income: 'income',
    transfer: 'transfer'
} as const;
export type OperationKind = (typeof OPERATION_KINDS)[keyof typeof OPERATION_KINDS];

export const INCOME_KINDS = {
    dividend: 'dividend',
    jcp: 'jcp',
    fiiIncome: 'fii_income',
    interest: 'interest',
    staking: 'staking'
} as const;
export type IncomeKind = (typeof INCOME_KINDS)[keyof typeof INCOME_KINDS];

export const MAX_OPERATIONS_PER_IMPORT: number = 5000;

export interface BalanceState {
    readonly quantity: string;
    readonly averagePrice: string | null;
}

export interface PositionSnapshot extends BalanceState {
    readonly classId: string;
}

export interface PositionSnapshotEntry {
    readonly assetId: string;
    readonly holderUserId: string | null;
    readonly state: PositionSnapshot | null;
}

export interface CostOperation {
    readonly kind: OperationKind;
    readonly tradeDate: string;
    readonly lineNumber: number;
    readonly quantity: string;
    readonly unitPrice: string;
    readonly feesMinor: number;
    readonly currency: string;
    readonly dayTrade: boolean;
    readonly historyOnly: boolean;
}

export type EventDirection = 'credit' | 'debit';

export interface OperationInput extends CostOperation {
    readonly assetId: string;
    readonly direction: EventDirection | null;
    readonly incomeKind: IncomeKind | null;
    readonly settlementDate: string | null;
    readonly grossMinor: number;
    readonly withheldTaxMinor: number | null;
    readonly fxRate: string | null;
    readonly grossBrlMinor: number | null;
    readonly sourceRef: string;
}

export interface NewImportInput {
    readonly createdBy: string | null;
    readonly source: ImportSource;
    readonly fileSha256: string;
    readonly fileName: string;
    readonly noteNumbers: readonly string[];
}

export interface PositionEffect {
    readonly assetId: string;
    readonly before: BalanceState | null;
    readonly after: BalanceState | null;
}

export interface ApplyResult {
    readonly applied: number;
    readonly skippedDuplicates: number;
    readonly effects: readonly PositionEffect[];
}

export const FAILURE_REASONS = {
    sellExceedsPosition: 'sell_exceeds_position',
    eventFactor: 'event_factor',
    invalidQuantity: 'invalid_quantity',
    assetNotAvailable: 'asset_not_available'
} as const;
export type FailureReason = (typeof FAILURE_REASONS)[keyof typeof FAILURE_REASONS];
