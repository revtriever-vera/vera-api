import { AppError } from '../../../shared/errors/app.error';

export class TransactionNotFoundError extends AppError {
    public constructor(transactionId: string) {
        super({
            code: 'transactions.transaction_not_found',
            status: 404,
            detail: 'The transaction does not exist.',
            meta: { transactionId }
        });
    }
}

export class AccountNotFoundError extends AppError {
    public constructor(accountId: string) {
        super({
            code: 'transactions.account_not_found',
            status: 404,
            detail: 'The financial account does not exist.',
            meta: { accountId }
        });
    }
}

export class ImportNotFoundError extends AppError {
    public constructor(importId: string) {
        super({
            code: 'imports.import_not_found',
            status: 404,
            detail: 'The import does not exist.',
            meta: { importId }
        });
    }
}

export class CategoryKindMismatchError extends AppError {
    public constructor(categoryId: string, transactionId: string) {
        super({
            code: 'transactions.category_kind_mismatch',
            status: 422,
            detail: 'An income category cannot be assigned to an outgoing transaction.',
            meta: { categoryId, transactionId }
        });
    }
}

export class AccountManagedByConnectionError extends AppError {
    public constructor(accountId: string) {
        super({
            code: 'transactions.account_managed_by_connection',
            status: 422,
            detail: 'The account comes from a bank connection and is removed together with it.',
            meta: { accountId }
        });
    }
}

export class TransactionLimitReachedError extends AppError {
    public constructor(limit: number) {
        super({
            code: 'transactions.limit_reached',
            status: 422,
            detail: 'The company reached the maximum number of transactions or financial accounts.',
            meta: { limit }
        });
    }
}

export class InvalidCorrectionRuleError extends AppError {
    public constructor(reason: string) {
        super({
            code: 'categories.invalid_rule',
            status: 422,
            detail: 'The rule cannot be created from this transaction.',
            meta: { reason }
        });
    }
}
