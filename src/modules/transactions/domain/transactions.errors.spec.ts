import { describe, expect, it } from 'vitest';
import {
    AccountManagedByConnectionError,
    AccountNotFoundError,
    CategoryKindMismatchError,
    ImportNotFoundError,
    InvalidCorrectionRuleError,
    TransactionLimitReachedError,
    TransactionNotFoundError
} from './transactions.errors';

describe('transactions errors', () => {
    it('cada erro leva o código e o status do contrato do épico', () => {
        expect([
            [new TransactionNotFoundError('t').code, new TransactionNotFoundError('t').status],
            [new AccountNotFoundError('a').code, new AccountNotFoundError('a').status],
            [new ImportNotFoundError('i').code, new ImportNotFoundError('i').status],
            [new CategoryKindMismatchError('c', 't').code, new CategoryKindMismatchError('c', 't').status],
            [new AccountManagedByConnectionError('a').code, new AccountManagedByConnectionError('a').status],
            [new TransactionLimitReachedError(1).code, new TransactionLimitReachedError(1).status],
            [new InvalidCorrectionRuleError('r').code, new InvalidCorrectionRuleError('r').status]
        ]).toEqual([
            ['transactions.transaction_not_found', 404],
            ['transactions.account_not_found', 404],
            ['imports.import_not_found', 404],
            ['transactions.category_kind_mismatch', 422],
            ['transactions.account_managed_by_connection', 422],
            ['transactions.limit_reached', 422],
            ['categories.invalid_rule', 422]
        ]);
    });
});
