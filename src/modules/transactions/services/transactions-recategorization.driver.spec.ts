import { describe, expect, it, vi } from 'vitest';
import { makeRule, makeTransaction } from '../../../../test/support/spending-factories';
import { CategoryRuleService } from '../../spending-categories/services/category-rule.service';
import { TransactionCategorizerService } from '../../spending-categories/services/transaction-categorizer.service';
import { TransactionDomain } from '../domain/transaction.domain';
import { Transaction } from '../domain/transactions.types';
import { TransactionsLogService } from './transactions-log.service';
import { TransactionsMetricsService } from './transactions-metrics.service';
import { TransactionsRecategorizationDriver } from './transactions-recategorization.driver';

interface Built {
    readonly driver: TransactionsRecategorizationDriver;
    readonly domain: Record<string, ReturnType<typeof vi.fn>>;
    readonly categorizeMany: ReturnType<typeof vi.fn>;
    readonly portScope: ReturnType<typeof vi.fn>;
    readonly recategorized: ReturnType<typeof vi.fn>;
}

interface Outcome {
    readonly categoryId: string | null;
    readonly source: string;
    readonly ruleId: string | null;
}

function build(
    batches: Transaction[][],
    outcome: Outcome | ((index: number) => Outcome) = { categoryId: 'cat-1', source: 'rule', ruleId: 'r1' }
): Built {
    const select: ReturnType<typeof vi.fn> = vi.fn();
    for (const batch of batches) {
        select.mockResolvedValueOnce(batch);
    }
    select.mockResolvedValue([]);
    const domain: Record<string, ReturnType<typeof vi.fn>> = {
        selectBatch: select,
        countSelection: vi.fn().mockResolvedValue(4),
        applyOutcome: vi.fn().mockImplementation((ids: string[]) => Promise.resolve(ids.length)),
        moveCategory: vi.fn().mockImplementation((ids: string[]) => Promise.resolve(ids.length))
    };
    const categorizeMany: ReturnType<typeof vi.fn> = vi
        .fn()
        .mockImplementation((inputs: unknown[]) =>
            Promise.resolve(
                inputs.map((_input: unknown, index: number): Outcome => (typeof outcome === 'function' ? outcome(index) : outcome))
            )
        );
    const portScope: ReturnType<typeof vi.fn> = vi.fn();
    const recategorized: ReturnType<typeof vi.fn> = vi.fn();
    const driver: TransactionsRecategorizationDriver = new TransactionsRecategorizationDriver(
        domain as unknown as TransactionDomain,
        { categorizeMany } as unknown as TransactionCategorizerService,
        {
            listForCompany: vi.fn().mockResolvedValue([makeRule({ id: 'r1', matchType: 'contains', pattern: 'LOJA', appliesTo: 'out' })])
        } as unknown as CategoryRuleService,
        { portScope } as unknown as TransactionsLogService,
        { recategorized } as unknown as TransactionsMetricsService
    );
    return { driver, domain, categorizeMany, portScope, recategorized };
}

describe('TransactionsRecategorizationDriver', () => {
    it('rule_saved seleciona só linhas que não são do usuário, roda o pipeline e conta as que mudaram', async () => {
        const rows: Transaction[] = [
            makeTransaction({ id: 'a', categoryId: null, categorySource: 'none' }),
            makeTransaction({ id: 'b', categoryId: 'cat-1', categorySource: 'rule', ruleId: 'r1' })
        ];
        const built: Built = build([rows]);

        const affected: number = await built.driver.recategorize({ kind: 'rule_saved', ruleId: 'r1' });

        expect(affected).toBe(1);
        expect(built.domain['selectBatch']).toHaveBeenCalledWith(
            { kind: 'matcher', matchType: 'contains', pattern: 'LOJA', appliesTo: 'out' },
            null,
            1000,
            false
        );
        expect(built.domain['applyOutcome']).toHaveBeenCalledWith(['a'], { categoryId: 'cat-1', source: 'rule', ruleId: 'r1' });
        expect(built.portScope).toHaveBeenCalledWith('rule_saved', 1);
        expect(built.recategorized).toHaveBeenCalledWith('rule', 1);
    });

    it('a precedência vem do pipeline: o resultado de cada linha é o que o categorizador devolver', async () => {
        const rows: Transaction[] = [makeTransaction({ id: 'a' }), makeTransaction({ id: 'b' })];
        const built: Built = build([rows], (index: number) =>
            index === 0
                ? { categoryId: 'by-counterparty', source: 'rule', ruleId: 'r-cp' }
                : { categoryId: 'by-contains', source: 'rule', ruleId: 'r-ct' }
        );

        await built.driver.recategorize({ kind: 'rule_saved', ruleId: 'r1' });

        expect(built.domain['applyOutcome']).toHaveBeenCalledWith(['a'], { categoryId: 'by-counterparty', source: 'rule', ruleId: 'r-cp' });
        expect(built.domain['applyOutcome']).toHaveBeenCalledWith(['b'], { categoryId: 'by-contains', source: 'rule', ruleId: 'r-ct' });
    });

    it('agrupa as linhas com o mesmo resultado numa atualização só', async () => {
        const rows: Transaction[] = [makeTransaction({ id: 'a' }), makeTransaction({ id: 'b' }), makeTransaction({ id: 'c' })];
        const built: Built = build([rows]);

        const affected: number = await built.driver.recategorize({ kind: 'rule_saved', ruleId: 'r1' });

        expect(affected).toBe(3);
        expect(built.domain['applyOutcome']).toHaveBeenCalledTimes(1);
        expect(built.domain['applyOutcome']).toHaveBeenCalledWith(['a', 'b', 'c'], expect.anything());
    });

    it('rule_saved de regra que não existe mais não toca nada', async () => {
        const built: Built = build([]);

        const affected: number = await built.driver.recategorize({ kind: 'rule_saved', ruleId: 'gone' });

        expect(affected).toBe(0);
        expect(built.domain['selectBatch']).not.toHaveBeenCalled();
    });

    it('rule_removed roda o pipeline nas linhas que tinham a regra', async () => {
        const built: Built = build([[makeTransaction({ id: 'a', ruleId: 'r1', categoryId: 'cat-1', categorySource: 'rule' })]], {
            categoryId: null,
            source: 'none',
            ruleId: null
        });

        const affected: number = await built.driver.recategorize({ kind: 'rule_removed', ruleId: 'r1' });

        expect(affected).toBe(1);
        expect(built.domain['selectBatch']).toHaveBeenCalledWith({ kind: 'rule', ruleId: 'r1' }, null, 1000, false);
    });

    it('category_removed com destino mantém a origem e move em lotes', async () => {
        const built: Built = build([[makeTransaction({ id: 'a' }), makeTransaction({ id: 'b' })]]);

        const affected: number = await built.driver.recategorize({ kind: 'category_removed', categoryId: 'old', moveToCategoryId: 'new' });

        expect(affected).toBe(2);
        expect(built.domain['moveCategory']).toHaveBeenCalledWith(['a', 'b'], 'new');
        expect(built.domain['selectBatch']).toHaveBeenCalledWith({ kind: 'category', categoryId: 'old' }, null, 1000, true);
        expect(built.categorizeMany).not.toHaveBeenCalled();
    });

    it('category_removed sem destino roda o pipeline inclusive nas linhas do usuário', async () => {
        const built: Built = build([[makeTransaction({ id: 'a', categoryId: 'old', categorySource: 'user' })]], {
            categoryId: null,
            source: 'none',
            ruleId: null
        });

        const affected: number = await built.driver.recategorize({ kind: 'category_removed', categoryId: 'old', moveToCategoryId: null });

        expect(affected).toBe(1);
        expect(built.domain['selectBatch']).toHaveBeenCalledWith({ kind: 'category', categoryId: 'old' }, null, 1000, true);
        expect(built.domain['applyOutcome']).toHaveBeenCalledWith(['a'], { categoryId: null, source: 'none', ruleId: null });
    });

    it('percorre mais de um lote usando o último id como cursor', async () => {
        const full: Transaction[] = Array.from({ length: 1000 }, (_, index: number) =>
            makeTransaction({ id: `id-${String(index).padStart(4, '0')}` })
        );
        const built: Built = build([full, [makeTransaction({ id: 'id-9999' })]]);

        const affected: number = await built.driver.recategorize({ kind: 'rule_saved', ruleId: 'r1' });

        expect(affected).toBe(1001);
        expect(built.domain['selectBatch']).toHaveBeenNthCalledWith(2, expect.anything(), 'id-0999', 1000, false);
    });

    it('countMatches usa a mesma seleção do rule_saved, sem as linhas do usuário', async () => {
        const built: Built = build([]);

        const count: number = await built.driver.countMatches({ matchType: 'description', pattern: 'LOJA', appliesTo: 'any' });

        expect(count).toBe(4);
        expect(built.domain['countSelection']).toHaveBeenCalledWith(
            { kind: 'matcher', matchType: 'description', pattern: 'LOJA', appliesTo: 'any' },
            false
        );
    });
});
