import { Insertable, Selectable, Updateable } from 'kysely';
import { FinancialAccounts, TransactionImports, Transactions } from '../../../core/database/generated/database.types';

export type FinancialAccount = Selectable<FinancialAccounts>;
export type NewFinancialAccount = Insertable<FinancialAccounts>;
export type Transaction = Selectable<Transactions>;
export type NewTransaction = Insertable<Transactions>;
export type TransactionPatch = Updateable<Transactions>;
export type TransactionImport = Selectable<TransactionImports>;
export type NewTransactionImport = Insertable<TransactionImports>;

export const ACCOUNT_KINDS = {
    checking: 'checking',
    savings: 'savings',
    creditCard: 'credit_card',
    other: 'other'
} as const;

export type AccountKind = (typeof ACCOUNT_KINDS)[keyof typeof ACCOUNT_KINDS];

export const TRANSACTION_SOURCES = {
    pluggy: 'pluggy',
    ofx: 'ofx',
    csv: 'csv',
    sample: 'sample'
} as const;

export type TransactionSource = (typeof TRANSACTION_SOURCES)[keyof typeof TRANSACTION_SOURCES];

export const FILE_SOURCES: readonly TransactionSource[] = [TRANSACTION_SOURCES.ofx, TRANSACTION_SOURCES.csv];

export const CATEGORY_ORIGINS = {
    user: 'user',
    rule: 'rule',
    dictionary: 'dictionary',
    provider: 'provider',
    none: 'none'
} as const;

export type CategoryOrigin = (typeof CATEGORY_ORIGINS)[keyof typeof CATEGORY_ORIGINS];

export const IMPORT_FORMATS = {
    ofx: 'ofx',
    csvNubankCard: 'csv_nubank_card',
    csvNubankAccount: 'csv_nubank_account',
    csvGeneric: 'csv_generic'
} as const;

export type ImportFormat = (typeof IMPORT_FORMATS)[keyof typeof IMPORT_FORMATS];

export const IMPORT_STATUSES = {
    processing: 'processing',
    completed: 'completed',
    undone: 'undone',
    failed: 'failed'
} as const;

export type ImportStatus = (typeof IMPORT_STATUSES)[keyof typeof IMPORT_STATUSES];

export const ACCOUNT_PROVIDERS = {
    pluggy: 'pluggy'
} as const;

export type AccountProvider = (typeof ACCOUNT_PROVIDERS)[keyof typeof ACCOUNT_PROVIDERS];

export const DIRECTIONS = {
    in: 'in',
    out: 'out'
} as const;

export type Direction = (typeof DIRECTIONS)[keyof typeof DIRECTIONS];

export const RULE_SCOPES = {
    counterparty: 'counterparty',
    description: 'description'
} as const;

export type RuleScope = (typeof RULE_SCOPES)[keyof typeof RULE_SCOPES];

export const MAX_TRANSACTIONS_PER_COMPANY: number = 200_000;
export const MAX_ACCOUNTS_PER_COMPANY: number = 30;
export const INGESTION_CHUNK_SIZE: number = 500;
export const RECATEGORIZATION_CHUNK_SIZE: number = 1000;
export const EXPORT_PAGE_SIZE: number = 1000;
export const DESCRIPTION_MAX_LENGTH: number = 200;
export const COUNTERPARTY_NAME_MAX_LENGTH: number = 80;
export const ACCOUNT_NAME_MAX_LENGTH: number = 60;
export const SEARCH_MIN_LENGTH: number = 2;
export const SEARCH_MAX_LENGTH: number = 60;
export const MAX_RANGE_DAYS: number = 400;
export const DEFAULT_PAGE_SIZE: number = 50;
export const MAX_PAGE_SIZE: number = 200;
export const MAX_CROSS_SOURCE_DAYS: number = 1;
export const ACCOUNT_LIST_LIMIT: number = 100;
export const IMPORT_LIST_PAGE_SIZE: number = 50;
export const BASE_CURRENCY: string = 'BRL';
export const LABEL_MAX_LENGTH: number = 80;

export interface IncomingTransaction {
    readonly externalId: string;
    readonly date: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly description: string;
    readonly counterpartyName?: string | null;
    readonly counterpartyDocument?: string | null;
    readonly providerCategoryId?: string | null;
    readonly installmentNumber?: number | null;
    readonly installmentTotal?: number | null;
}

export interface IngestionBatch {
    readonly accountId: string;
    readonly source: TransactionSource;
    readonly importId?: string | null;
    readonly isSample?: boolean;
    readonly items: readonly IncomingTransaction[];
}

export interface IngestionResult {
    readonly inserted: number;
    readonly updated: number;
    readonly unchanged: number;
    readonly duplicates: number;
    readonly superseded: number;
    readonly rejected: number;
}

export interface PreparedTransaction {
    readonly externalId: string;
    readonly date: string;
    readonly amountMinor: number;
    readonly description: string;
    readonly normalizedDescription: string;
    readonly counterpartyName: string | null;
    readonly counterpartyKey: string | null;
    readonly providerCategoryId: string | null;
    readonly installmentNumber: number | null;
    readonly installmentTotal: number | null;
}

export interface CategorizationOutcome {
    readonly categoryId: string | null;
    readonly source: Exclude<CategoryOrigin, 'user'>;
    readonly ruleId: string | null;
}

export interface TransactionFilter {
    readonly fromDate: string;
    readonly toDate: string;
    readonly accountId?: string;
    readonly categoryId?: string;
    readonly uncategorized?: boolean;
    readonly direction?: Direction;
    readonly search?: string;
}

export interface TransactionTotals {
    readonly inMinor: number;
    readonly outMinor: number;
    readonly count: number;
}

export interface MonthRange {
    readonly fromMonth: string;
    readonly toMonth: string;
}

export interface MonthlyCategoryNet {
    readonly month: string;
    readonly categoryId: string | null;
    readonly netMinor: number;
    readonly outflowMinor: number;
    readonly outflowCount: number;
    readonly transactionCount: number;
}

export interface AccountStats {
    readonly accountId: string;
    readonly transactionCount: number;
    readonly lastTransactionDate: string | null;
}

export interface ExportTransaction {
    readonly id: string;
    readonly accountId: string;
    readonly accountName: string;
    readonly institutionName: string | null;
    readonly date: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly description: string;
    readonly counterpartyName: string | null;
    readonly categoryId: string | null;
    readonly categorySource: CategoryOrigin;
    readonly source: TransactionSource;
}

export interface TransactionView {
    readonly id: string;
    readonly accountId: string;
    readonly accountName: string;
    readonly date: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly description: string;
    readonly counterpartyName: string | null;
    readonly categoryId: string | null;
    readonly categorySource: CategoryOrigin;
    readonly ruleId: string | null;
    readonly source: TransactionSource;
    readonly installment: { readonly number: number; readonly total: number } | null;
    readonly isSample: boolean;
}

export interface AccountView {
    readonly id: string;
    readonly name: string;
    readonly kind: AccountKind;
    readonly institutionName: string | null;
    readonly numberLast4: string | null;
    readonly currency: string;
    readonly source: 'pluggy' | 'file';
    readonly transactionCount: number;
    readonly lastTransactionDate: string | null;
    readonly isSample: boolean;
}

export interface ImportView {
    readonly id: string;
    readonly accountId: string;
    readonly format: ImportFormat;
    readonly fileName: string;
    readonly rows: number;
    readonly inserted: number;
    readonly duplicates: number;
    readonly rejected: number;
    readonly periodStart: string | null;
    readonly periodEnd: string | null;
    readonly status: ImportStatus;
    readonly isSample: boolean;
    readonly createdAt: string;
}

export interface UpsertProviderAccountInput {
    readonly provider: AccountProvider;
    readonly externalId: string;
    readonly kind: AccountKind;
    readonly name: string;
    readonly institutionName?: string | null;
    readonly numberLast4?: string | null;
    readonly currency: string;
    readonly isSample?: boolean;
}

export interface CreateFileAccountInput {
    readonly kind: AccountKind;
    readonly name: string;
    readonly institutionName?: string | null;
    readonly numberLast4?: string | null;
    readonly currency: string;
    readonly isSample?: boolean;
}

export interface RecordImportInput {
    readonly accountId: string;
    readonly format: ImportFormat;
    readonly fileName: string;
    readonly fileSha256: string;
    readonly rows: number;
    readonly periodStart?: string | null;
    readonly periodEnd?: string | null;
    readonly isSample?: boolean;
}

export interface FinishImportInput {
    readonly inserted: number;
    readonly duplicates: number;
    readonly rejected: number;
    readonly status?: typeof IMPORT_STATUSES.completed | typeof IMPORT_STATUSES.failed;
}
