import { DateUtil } from '../../../shared/utils/date.util';
import {
    ACCOUNT_KINDS,
    AccountKind,
    AccountStats,
    AccountView,
    CATEGORY_ORIGINS,
    CategoryOrigin,
    FinancialAccount,
    IMPORT_FORMATS,
    IMPORT_STATUSES,
    ImportFormat,
    ImportStatus,
    ImportView,
    Transaction,
    TRANSACTION_SOURCES,
    TransactionImport,
    TransactionSource,
    TransactionView
} from './transactions.types';

function oneOf<T extends string>(values: readonly T[], value: string, fallback: T): T {
    return values.find((candidate: T): boolean => candidate === value) ?? fallback;
}

export function toAccountKind(value: string): AccountKind {
    return oneOf(Object.values(ACCOUNT_KINDS), value, ACCOUNT_KINDS.other);
}

export function toSource(value: string): TransactionSource {
    return oneOf(Object.values(TRANSACTION_SOURCES), value, TRANSACTION_SOURCES.sample);
}

export function toCategoryOrigin(value: string): CategoryOrigin {
    return oneOf(Object.values(CATEGORY_ORIGINS), value, CATEGORY_ORIGINS.none);
}

export function toImportFormat(value: string): ImportFormat {
    return oneOf(Object.values(IMPORT_FORMATS), value, IMPORT_FORMATS.csvGeneric);
}

export function toImportStatus(value: string): ImportStatus {
    return oneOf(Object.values(IMPORT_STATUSES), value, IMPORT_STATUSES.failed);
}

export function toDateString(value: Date): string {
    return DateUtil.onlyLocalDateString(value);
}

export function toTransactionView(row: Transaction, accountName: string): TransactionView {
    const hasInstallment: boolean = row.installmentNumber !== null && row.installmentTotal !== null;
    return {
        id: row.id,
        accountId: row.accountId,
        accountName,
        date: toDateString(row.date),
        amountMinor: Number(row.amountMinor),
        currency: row.currency,
        description: row.description,
        counterpartyName: row.counterpartyName,
        categoryId: row.categoryId,
        categorySource: toCategoryOrigin(row.categorySource),
        ruleId: row.ruleId,
        source: toSource(row.source),
        installment: hasInstallment ? { number: row.installmentNumber ?? 0, total: row.installmentTotal ?? 0 } : null,
        isSample: row.isSample
    };
}

export function toAccountView(account: FinancialAccount, stats: AccountStats | undefined): AccountView {
    return {
        id: account.id,
        name: account.name,
        kind: toAccountKind(account.kind),
        institutionName: account.institutionName,
        institutionLogoUrl: account.institutionLogoUrl,
        numberLast4: account.numberLast4,
        currency: account.currency,
        source: account.provider === null ? 'file' : 'pluggy',
        transactionCount: stats?.transactionCount ?? 0,
        lastTransactionDate: stats?.lastTransactionDate ?? null,
        isSample: account.isSample
    };
}

export function toImportView(row: TransactionImport): ImportView {
    return {
        id: row.id,
        accountId: row.accountId,
        format: toImportFormat(row.format),
        fileName: row.fileName,
        rows: row.rows,
        inserted: row.inserted,
        duplicates: row.duplicates,
        rejected: row.rejected,
        periodStart: row.periodStart === null ? null : toDateString(row.periodStart),
        periodEnd: row.periodEnd === null ? null : toDateString(row.periodEnd),
        status: toImportStatus(row.status),
        isSample: row.isSample,
        createdAt: row.createdAt.toISOString()
    };
}
