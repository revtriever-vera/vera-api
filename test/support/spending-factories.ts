import { CategoryRule, SpendingCategory } from '../../src/modules/spending-categories/domain/categories.types';
import { FinancialAccount, Transaction, TransactionImport } from '../../src/modules/transactions/domain/transactions.types';

let sequence: number = 0;

export function makeCategory(overrides: Partial<SpendingCategory> = {}): SpendingCategory {
    sequence += 1;
    return {
        id: `category-${String(sequence)}`,
        companyId: 'company-1',
        systemKey: null,
        name: `Categoria ${String(sequence)}`,
        kind: 'expense',
        flexibility: 'flexible',
        icon: 'Home',
        position: sequence,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...overrides
    };
}

export function makeRule(overrides: Partial<CategoryRule> = {}): CategoryRule {
    sequence += 1;
    return {
        id: `rule-${String(sequence)}`,
        companyId: 'company-1',
        categoryId: 'category-1',
        matchType: 'contains',
        pattern: `PADRAO ${String(sequence)}`,
        label: `padrão ${String(sequence)}`,
        appliesTo: 'any',
        isSample: false,
        createdAt: new Date('2026-10-01T10:00:00.000Z'),
        updatedAt: new Date('2026-10-01T10:00:00.000Z'),
        deletedAt: null,
        ...overrides
    };
}

const TRANSACTION_LINKS = {
    counterpartyName: null,
    counterpartyKey: null,
    providerCategoryId: null,
    installmentNumber: null,
    installmentTotal: null,
    categoryId: null,
    ruleId: null,
    importId: null,
    absorbedExternalId: null,
    absorbedImportId: null,
    supersededById: null
};

function audit(): Pick<Transaction, 'createdAt' | 'updatedAt' | 'deletedAt'> {
    return { createdAt: new Date('2026-10-01T10:00:00.000Z'), updatedAt: new Date('2026-10-01T10:00:00.000Z'), deletedAt: null };
}

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
    sequence += 1;
    return {
        id: `transaction-${String(sequence)}`,
        companyId: 'company-1',
        accountId: 'account-1',
        source: 'pluggy',
        externalId: `pluggy:${String(sequence)}`,
        date: new Date(2026, 8, 10),
        amountMinor: '-5000',
        currency: 'BRL',
        description: 'COMPRA',
        normalizedDescription: 'COMPRA',
        categorySource: 'none',
        isSample: false,
        ...TRANSACTION_LINKS,
        ...audit(),
        ...overrides
    };
}

export function makeFinancialAccount(overrides: Partial<FinancialAccount> = {}): FinancialAccount {
    sequence += 1;
    return {
        id: `account-${String(sequence)}`,
        companyId: 'company-1',
        kind: 'checking',
        name: `Conta ${String(sequence)}`,
        institutionName: null,
        numberLast4: null,
        currency: 'BRL',
        provider: null,
        externalId: null,
        isSample: false,
        createdAt: new Date('2026-10-01T10:00:00.000Z'),
        updatedAt: new Date('2026-10-01T10:00:00.000Z'),
        deletedAt: null,
        ...overrides
    };
}

export function makeTransactionImport(overrides: Partial<TransactionImport> = {}): TransactionImport {
    sequence += 1;
    return {
        id: `import-${String(sequence)}`,
        companyId: 'company-1',
        accountId: 'account-1',
        format: 'ofx',
        fileName: 'extrato.ofx',
        fileSha256: 'a'.repeat(64),
        rows: 3,
        inserted: 2,
        duplicates: 1,
        rejected: 0,
        periodStart: new Date(2026, 8, 1),
        periodEnd: new Date(2026, 8, 30),
        status: 'completed',
        isSample: false,
        ...audit(),
        ...overrides
    };
}
