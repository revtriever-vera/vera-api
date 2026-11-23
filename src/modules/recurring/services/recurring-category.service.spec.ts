import { describe, expect, it, vi } from 'vitest';
import { RecurrenceTransaction } from '../../transactions/services/transaction-reader.service';
import { CategoryReaderService } from '../../spending-categories/services/category-reader.service';
import { CategoryRuleService } from '../../spending-categories/services/category-rule.service';
import { RecategorizationRegistry } from '../../spending-categories/services/recategorization.registry';
import { TransactionReaderService } from '../../transactions/services/transaction-reader.service';
import { RecurringSeriesRecord } from '../domain/recurring-series.types';
import { RecurringCategoryService } from './recurring-category.service';
import { RecurringLogService } from './recurring-log.service';

const CATEGORIES = [
    { id: 'cat-subs', systemKey: 'subscriptions', kind: 'expense' },
    { id: 'cat-other', systemKey: 'other_expenses', kind: 'expense' },
    { id: 'cat-shop', systemKey: 'shopping', kind: 'expense' },
    { id: 'cat-income', systemKey: 'income', kind: 'income' }
];

function charge(overrides: Partial<RecurrenceTransaction> = {}): RecurrenceTransaction {
    return {
        id: 't1',
        accountId: 'a1',
        date: '2026-10-05',
        amountMinor: -5590,
        currency: 'BRL',
        description: 'Netflix',
        normalizedDescription: 'NETFLIX COM',
        counterpartyName: null,
        counterpartyKey: null,
        categoryId: null,
        categorySource: 'none',
        installmentTotal: null,
        isSample: false,
        ...overrides
    };
}

function series(merchantKey: string): RecurringSeriesRecord {
    return { id: 's1', name: 'Netflix', merchantKey } as RecurringSeriesRecord;
}

function build(charges: RecurrenceTransaction[], dictionaryPattern: string | null = null) {
    const upsert: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ id: 'rule-1' });
    const recategorize: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(4);
    const service: RecurringCategoryService = new RecurringCategoryService(
        { findForRecurrence: vi.fn().mockResolvedValue(charges) } as unknown as TransactionReaderService,
        {
            requireById: vi.fn().mockImplementation((id: string) => Promise.resolve(CATEGORIES.find((category) => category.id === id))),
            listForCompany: vi.fn().mockResolvedValue(CATEGORIES)
        } as unknown as CategoryReaderService,
        { upsertFromCorrection: upsert } as unknown as CategoryRuleService,
        {
            resolve: vi.fn().mockReturnValue(dictionaryPattern === null ? null : { pattern: dictionaryPattern, category: 'subscriptions' })
        },
        { recategorize } as unknown as RecategorizationRegistry,
        { categoryRule: vi.fn() } as unknown as RecurringLogService
    );
    return { service, upsert, recategorize };
}

describe('RecurringCategoryService.alwaysTo', () => {
    it('com cobranças sem categoria salva a regra do estabelecimento e recategoriza as passadas', async () => {
        const { service, upsert, recategorize } = build(
            [charge(), charge({ id: 't2', categoryId: 'cat-other', categorySource: 'provider' })],
            'NETFLIX'
        );

        const outcome = await service.alwaysTo(series('NETFLIX'), ['t1', 't2'], 'cat-subs');

        expect(outcome).toEqual({ created: true, recategorized: 4 });
        expect(upsert).toHaveBeenCalledWith({
            matchType: 'contains',
            pattern: 'NETFLIX',
            label: 'Netflix',
            appliesTo: 'out',
            categoryId: 'cat-subs'
        });
        expect(recategorize).toHaveBeenCalledWith({ kind: 'rule_saved', ruleId: 'rule-1' });
    });

    it('a regra segue o que a série usa como chave: contraparte ou a descrição mais frequente', async () => {
        const viaCounterparty = build([charge({ counterpartyKey: 'cp-9' })]);
        const viaDescription = build([charge(), charge({ id: 't2' }), charge({ id: 't3', normalizedDescription: 'OUTRA' })]);

        await viaCounterparty.service.alwaysTo(series('cp-9'), ['t1'], 'cat-subs');
        await viaDescription.service.alwaysTo(series('NETFLIX'), ['t1', 't2', 't3'], 'cat-subs');

        expect(viaCounterparty.upsert).toHaveBeenCalledWith(expect.objectContaining({ matchType: 'counterparty', pattern: 'cp-9' }));
        expect(viaDescription.upsert).toHaveBeenCalledWith(expect.objectContaining({ matchType: 'description', pattern: 'NETFLIX COM' }));
    });

    it('nunca muda a categoria posta pela pessoa, pela regra dela nem a que já é de outra categoria', async () => {
        for (const locked of [
            charge({ categoryId: 'cat-shop', categorySource: 'user' }),
            charge({ categoryId: 'cat-other', categorySource: 'rule' }),
            charge({ categoryId: 'cat-shop', categorySource: 'dictionary' })
        ]) {
            const { service, upsert, recategorize } = build([charge({ id: 't0' }), locked]);

            await expect(service.alwaysTo(series('NETFLIX'), ['t0', 't1'], 'cat-subs')).resolves.toEqual({
                created: false,
                recategorized: 0
            });

            expect(upsert).not.toHaveBeenCalled();
            expect(recategorize).not.toHaveBeenCalled();
        }
    });

    it('recusa categoria de receita', async () => {
        const { service } = build([charge()]);

        await expect(service.alwaysTo(series('NETFLIX'), ['t1'], 'cat-income')).rejects.toMatchObject({
            code: 'recurring.category_kind_mismatch'
        });
    });
});
