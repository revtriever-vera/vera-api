import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCategory, makeFinancialAccount, makeRule, makeTransaction } from '../../../../test/support/spending-factories';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { CategoryReaderService } from '../../spending-categories/services/category-reader.service';
import { CategoryRuleService } from '../../spending-categories/services/category-rule.service';
import { TransactionCategorizerService } from '../../spending-categories/services/transaction-categorizer.service';
import { FinancialAccountDomain } from '../domain/financial-account.domain';
import { TransactionDomain } from '../domain/transaction.domain';
import { TransactionNotFoundError } from '../domain/transactions.errors';
import { Transaction } from '../domain/transactions.types';
import { TransactionsLogService } from '../services/transactions-log.service';
import { TransactionsMetricsService } from '../services/transactions-metrics.service';
import { TransactionsRecategorizationDriver } from '../services/transactions-recategorization.driver';
import { TransactionRecategorizeApplication } from './transaction-recategorize.application';

interface Built {
    readonly application: TransactionRecategorizeApplication;
    readonly patch: ReturnType<typeof vi.fn>;
    readonly upsert: ReturnType<typeof vi.fn>;
    readonly recategorize: ReturnType<typeof vi.fn>;
    readonly categorize: ReturnType<typeof vi.fn>;
    readonly recategorizedLog: ReturnType<typeof vi.fn>;
}

function build(current: Transaction, kind: string = 'expense'): Built {
    const patch: ReturnType<typeof vi.fn> = vi
        .fn()
        .mockImplementation((id: string, values: object) => Promise.resolve({ ...current, id, ...values }));
    const upsert: ReturnType<typeof vi.fn> = vi
        .fn()
        .mockResolvedValue(makeRule({ id: 'rule-1', matchType: 'counterparty', label: 'Maria Souza', appliesTo: 'out' }));
    const recategorize: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(3);
    const categorize: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ categoryId: 'auto', source: 'dictionary', ruleId: null });
    const recategorizedLog: ReturnType<typeof vi.fn> = vi.fn();
    const application: TransactionRecategorizeApplication = new TransactionRecategorizeApplication(
        {
            require: vi
                .fn()
                .mockImplementation((id: string) =>
                    id === 'missing' ? Promise.reject(new TransactionNotFoundError(id)) : Promise.resolve(current)
                ),
            patch
        } as unknown as TransactionDomain,
        { require: vi.fn().mockResolvedValue(makeFinancialAccount({ name: 'Itaú' })) } as unknown as FinancialAccountDomain,
        {
            requireById: vi.fn().mockImplementation((id: string) => Promise.resolve(makeCategory({ id, kind })))
        } as unknown as CategoryReaderService,
        { upsertFromCorrection: upsert } as unknown as CategoryRuleService,
        { categorize } as unknown as TransactionCategorizerService,
        { recategorize } as unknown as TransactionsRecategorizationDriver,
        { recategorized: recategorizedLog } as unknown as TransactionsLogService,
        { recategorized: vi.fn() } as unknown as TransactionsMetricsService
    );
    return { application, patch, upsert, recategorize, categorize, recategorizedLog };
}

beforeEach(() => {
    TransactionalContext.set({ withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn() } as unknown as DatabaseClient);
});

describe('TransactionRecategorizeApplication', () => {
    const outgoing: Transaction = makeTransaction({
        id: 't1',
        amountMinor: '-45000',
        normalizedDescription: 'MARIA SOUZA',
        counterpartyKey: 'k'.repeat(64),
        counterpartyName: 'Maria Souza'
    });

    it('grava a categoria do usuário sem criar regra quando a regra não foi pedida', async () => {
        const built: Built = build(outgoing);

        const saved = await built.application.recategorize('t1', { categoryId: 'cat-1' });

        expect(built.patch).toHaveBeenCalledWith('t1', { categoryId: 'cat-1', categorySource: 'user', ruleId: null });
        expect(built.upsert).not.toHaveBeenCalled();
        expect(saved).toMatchObject({ rule: null, recategorized: 0, transaction: { accountName: 'Itaú', categorySource: 'user' } });
    });

    it('com regra de favorecido cria a regra, aplica ao passado pela porta e devolve a contagem', async () => {
        const built: Built = build(outgoing);

        const saved = await built.application.recategorize('t1', { categoryId: 'cat-1', rule: { scope: 'counterparty' } });

        expect(built.upsert).toHaveBeenCalledWith({
            matchType: 'counterparty',
            pattern: 'k'.repeat(64),
            label: 'Maria Souza',
            appliesTo: 'out',
            categoryId: 'cat-1',
            isSample: false
        });
        expect(built.recategorize).toHaveBeenCalledWith({ kind: 'rule_saved', ruleId: 'rule-1' });
        expect(saved.recategorized).toBe(3);
        expect(saved.rule).toMatchObject({ id: 'rule-1', matchType: 'counterparty', label: 'Maria Souza' });
        expect(built.recategorizedLog).toHaveBeenCalledWith('t1', expect.any(Boolean), 3);
    });

    it('a regra criada a partir de uma transação de exemplo nasce marcada como exemplo', async () => {
        const built: Built = build(makeTransaction({ ...outgoing, isSample: true }));

        await built.application.recategorize('t1', { categoryId: 'cat-1', rule: { scope: 'counterparty' } });

        expect(built.upsert).toHaveBeenCalledWith(expect.objectContaining({ isSample: true }));
    });

    it('regra por descrição usa a descrição normalizada como padrão e como rótulo, e entrada vira appliesTo in', async () => {
        const incoming: Transaction = makeTransaction({
            id: 't2',
            amountMinor: '1000',
            normalizedDescription: 'ESTORNO LOJA',
            counterpartyName: null
        });
        const built: Built = build(incoming);

        await built.application.recategorize('t2', { categoryId: 'cat-1', rule: { scope: 'description' } });

        expect(built.upsert).toHaveBeenCalledWith({
            matchType: 'description',
            pattern: 'ESTORNO LOJA',
            label: 'ESTORNO LOJA',
            appliesTo: 'in',
            categoryId: 'cat-1',
            isSample: false
        });
    });

    it('regra de favorecido sem favorecido na transação é recusada antes de gravar', async () => {
        const built: Built = build(makeTransaction({ id: 't3', counterpartyKey: null }));

        await expect(built.application.recategorize('t3', { categoryId: 'cat-1', rule: { scope: 'counterparty' } })).rejects.toMatchObject({
            code: 'categories.invalid_rule'
        });
        expect(built.patch).not.toHaveBeenCalled();
    });

    it('regra por descrição vazia depois de normalizar é recusada', async () => {
        const built: Built = build(makeTransaction({ id: 't4', normalizedDescription: '' }));

        await expect(built.application.recategorize('t4', { categoryId: 'cat-1', rule: { scope: 'description' } })).rejects.toMatchObject({
            code: 'categories.invalid_rule'
        });
    });

    it('categoria de renda em saída é recusada e em entrada é aceita; gasto em entrada é aceito', async () => {
        const income: Built = build(outgoing, 'income');
        const refund: Built = build(makeTransaction({ id: 't5', amountMinor: '2500' }), 'expense');
        const salary: Built = build(makeTransaction({ id: 't6', amountMinor: '2500' }), 'income');

        await expect(income.application.recategorize('t1', { categoryId: 'cat-income' })).rejects.toMatchObject({
            code: 'transactions.category_kind_mismatch'
        });
        await expect(refund.application.recategorize('t5', { categoryId: 'cat-1' })).resolves.toBeDefined();
        await expect(salary.application.recategorize('t6', { categoryId: 'cat-income' })).resolves.toBeDefined();
        expect(income.patch).not.toHaveBeenCalled();
    });

    it('categoryId nulo volta ao automático pelo categorizador', async () => {
        const built: Built = build(makeTransaction({ id: 't7', categorySource: 'user', categoryId: 'mine' }));

        await built.application.recategorize('t7', { categoryId: null });

        expect(built.categorize).toHaveBeenCalled();
        expect(built.patch).toHaveBeenCalledWith('t7', { categoryId: 'auto', categorySource: 'dictionary', ruleId: null });
        expect(built.upsert).not.toHaveBeenCalled();
    });

    it('transação inexistente propaga o 404', async () => {
        const built: Built = build(outgoing);

        await expect(built.application.recategorize('missing', { categoryId: 'cat-1' })).rejects.toBeInstanceOf(TransactionNotFoundError);
    });
});
