import { describe, expect, it, vi } from 'vitest';
import { makeCategory, makeRule } from '../../../../test/support/spending-factories';
import { CategorizationInput, CategorizationResult, CategoryRule, SpendingCategory } from '../domain/categories.types';
import { CategoryRuleDomain } from '../domain/category-rule.domain';
import { SYSTEM_CATEGORIES } from '../domain/system-categories';
import { CategoryReaderService } from './category-reader.service';
import { SpendingCategoriesMetricsService } from './spending-categories-metrics.service';
import { TransactionCategorizerService } from './transaction-categorizer.service';

const SYSTEM: SpendingCategory[] = SYSTEM_CATEGORIES.map((seed) =>
    makeCategory({ id: `sys-${seed.systemKey}`, systemKey: seed.systemKey, name: null, kind: seed.kind, flexibility: seed.flexibility })
);
const CUSTOM: SpendingCategory = makeCategory({ id: 'custom-pets' });

interface Built {
    readonly service: TransactionCategorizerService;
    readonly listForCompany: ReturnType<typeof vi.fn>;
    readonly listActive: ReturnType<typeof vi.fn>;
    readonly categorized: ReturnType<typeof vi.fn>;
}

function build(rules: CategoryRule[], categories: SpendingCategory[] = [...SYSTEM, CUSTOM]): Built {
    const listForCompany: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(categories);
    const listActive: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(rules);
    const categorized: ReturnType<typeof vi.fn> = vi.fn();
    const service: TransactionCategorizerService = new TransactionCategorizerService(
        { listForCompany } as unknown as CategoryReaderService,
        { listActive } as unknown as CategoryRuleDomain,
        { categorized } as unknown as SpendingCategoriesMetricsService
    );
    return { service, listForCompany, listActive, categorized };
}

function input(overrides: Partial<CategorizationInput> = {}): CategorizationInput {
    return {
        amountMinor: -3500,
        normalizedDescription: 'IFOOD RESTAURANTE SABOR',
        counterpartyKey: null,
        providerCategoryId: null,
        ...overrides
    };
}

describe('TransactionCategorizerService', () => {
    it('a regra do usuário vence o dicionário e a Pluggy', async () => {
        const rule: CategoryRule = makeRule({ id: 'r1', categoryId: CUSTOM.id, pattern: 'IFOOD' });
        const result: CategorizationResult = await build([rule]).service.categorize(input({ providerCategoryId: '09000000' }));

        expect(result).toEqual({ categoryId: CUSTOM.id, source: 'rule', ruleId: 'r1' });
    });

    it('o dicionário vence a categoria da Pluggy', async () => {
        const result: CategorizationResult = await build([]).service.categorize(input({ providerCategoryId: '09000000' }));

        expect(result).toEqual({ categoryId: 'sys-eating_out', source: 'dictionary', ruleId: null });
    });

    it('a Pluggy vale quando não há regra nem dicionário', async () => {
        const result: CategorizationResult = await build([]).service.categorize(
            input({ normalizedDescription: 'LOJINHA DO ZE', providerCategoryId: '09010000' })
        );

        expect(result).toEqual({ categoryId: 'sys-shopping', source: 'provider', ruleId: null });
    });

    it('sem nada que case, devolve none', async () => {
        const result: CategorizationResult = await build([]).service.categorize(input({ normalizedDescription: 'LOJINHA DO ZE' }));

        expect(result).toEqual({ categoryId: null, source: 'none', ruleId: null });
    });

    it('Pix para terceiros da Pluggy fica sem categoria', async () => {
        const result: CategorizationResult = await build([]).service.categorize(
            input({ normalizedDescription: 'MARIA SOUZA', providerCategoryId: '06000000' })
        );

        expect(result.source).toBe('none');
    });

    it('regra de categoria excluída não é devolvida e a próxima etapa assume', async () => {
        const rule: CategoryRule = makeRule({ categoryId: 'deleted-category', pattern: 'IFOOD' });
        const result: CategorizationResult = await build([rule]).service.categorize(input());

        expect(result.source).toBe('dictionary');
    });

    it('se a company não tem a categoria padrão do dicionário, cai para a etapa seguinte', async () => {
        const withoutEatingOut: SpendingCategory[] = SYSTEM.filter((category: SpendingCategory) => category.systemKey !== 'eating_out');
        const result: CategorizationResult = await build([], withoutEatingOut).service.categorize(
            input({ providerCategoryId: '09000000' })
        );

        expect(result).toEqual({ categoryId: 'sys-shopping', source: 'provider', ruleId: null });
    });

    it('categorizeMany com 1.000 entradas faz uma leitura de regras e uma de categorias', async () => {
        const built: Built = build([makeRule({ categoryId: CUSTOM.id, pattern: 'PADARIA' })]);
        const inputs: CategorizationInput[] = Array.from({ length: 1000 }, (_unused: unknown, index: number) =>
            input({ normalizedDescription: index % 2 === 0 ? 'PADARIA ESTRELA' : 'UBER TRIP' })
        );

        const results: readonly CategorizationResult[] = await built.service.categorizeMany(inputs);

        expect(results).toHaveLength(1000);
        expect(built.listForCompany).toHaveBeenCalledTimes(1);
        expect(built.listActive).toHaveBeenCalledTimes(1);
        expect(built.categorized).toHaveBeenCalledWith('rule', 500);
        expect(built.categorized).toHaveBeenCalledWith('dictionary', 500);
    });

    it('lista vazia não lê nada e devolve vazio', async () => {
        const built: Built = build([]);

        await expect(built.service.categorizeMany([])).resolves.toEqual([]);
        expect(built.listForCompany).not.toHaveBeenCalled();
        expect(built.categorized).not.toHaveBeenCalled();
    });

    it('é determinístico: a mesma entrada dá o mesmo resultado', async () => {
        const built: Built = build([makeRule({ categoryId: CUSTOM.id, pattern: 'UBER' })]);
        const first: CategorizationResult = await built.service.categorize(input({ normalizedDescription: 'UBER TRIP' }));
        const second: CategorizationResult = await built.service.categorize(input({ normalizedDescription: 'UBER TRIP' }));

        expect(second).toEqual(first);
    });
});
