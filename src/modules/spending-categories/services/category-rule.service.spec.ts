import { describe, expect, it, vi } from 'vitest';
import { makeCategory, makeRule } from '../../../../test/support/spending-factories';
import { CategoryNotFoundError } from '../domain/categories.errors';
import { CategoryRule } from '../domain/categories.types';
import { CategoryRuleDomain } from '../domain/category-rule.domain';
import { CategoryReaderService } from './category-reader.service';
import { CategoryRuleService } from './category-rule.service';
import { SpendingCategoriesLogService } from './spending-categories-log.service';
import { SpendingCategoriesMetricsService } from './spending-categories-metrics.service';

interface Built {
    readonly service: CategoryRuleService;
    readonly rules: Record<string, ReturnType<typeof vi.fn>>;
    readonly ruleWritten: ReturnType<typeof vi.fn>;
    readonly ruleAction: ReturnType<typeof vi.fn>;
}

function build(existing: CategoryRule | null): Built {
    const rules: Record<string, ReturnType<typeof vi.fn>> = {
        listActive: vi.fn().mockResolvedValue([]),
        findByMatch: vi.fn().mockResolvedValue(existing),
        create: vi.fn().mockImplementation((input: object) => Promise.resolve(makeRule({ ...input }))),
        update: vi.fn().mockImplementation((_id: string, input: object) => Promise.resolve(makeRule({ ...existing, ...input })))
    };
    const ruleWritten: ReturnType<typeof vi.fn> = vi.fn();
    const ruleAction: ReturnType<typeof vi.fn> = vi.fn();
    const reader: CategoryReaderService = {
        requireById: vi
            .fn()
            .mockImplementation((id: string) =>
                id === 'missing' ? Promise.reject(new CategoryNotFoundError(id)) : Promise.resolve(makeCategory({ id }))
            )
    } as unknown as CategoryReaderService;
    const service: CategoryRuleService = new CategoryRuleService(
        rules as unknown as CategoryRuleDomain,
        reader,
        { ruleWritten } as unknown as SpendingCategoriesLogService,
        { ruleAction } as unknown as SpendingCategoriesMetricsService
    );
    return { service, rules, ruleWritten, ruleAction };
}

describe('CategoryRuleService.upsertFromCorrection', () => {
    it('cria a regra quando não existe e normaliza o padrão de descrição', async () => {
        const built: Built = build(null);

        const rule: CategoryRule = await built.service.upsertFromCorrection({
            matchType: 'description',
            pattern: 'Padaria *Estrela 1234',
            label: 'Padaria Estrela',
            appliesTo: 'out',
            categoryId: 'c1'
        });

        expect(built.rules['findByMatch']).toHaveBeenCalledWith('description', 'PADARIA ESTRELA', 'out');
        expect(built.rules['create']).toHaveBeenCalledWith({
            categoryId: 'c1',
            matchType: 'description',
            pattern: 'PADARIA ESTRELA',
            label: 'Padaria Estrela',
            appliesTo: 'out'
        });
        expect(rule.pattern).toBe('PADARIA ESTRELA');
        expect(built.ruleWritten).toHaveBeenCalledWith(rule.id, 'description', 'learned', 0);
        expect(built.ruleAction).toHaveBeenCalledWith('learned', 'description');
    });

    it('não mexe na chave do favorecido', async () => {
        const built: Built = build(null);

        await built.service.upsertFromCorrection({
            matchType: 'counterparty',
            pattern: 'AbC123-xyz',
            label: 'Maria Souza',
            appliesTo: 'out',
            categoryId: 'c1'
        });

        expect(built.rules['findByMatch']).toHaveBeenCalledWith('counterparty', 'AbC123-xyz', 'out');
    });

    it('troca a categoria da regra existente em vez de duplicar', async () => {
        const existing: CategoryRule = makeRule({ id: 'r1', matchType: 'contains', pattern: 'PADARIA', categoryId: 'old' });
        const built: Built = build(existing);

        const rule: CategoryRule = await built.service.upsertFromCorrection({
            matchType: 'contains',
            pattern: 'padaria',
            label: 'padaria',
            appliesTo: 'any',
            categoryId: 'new'
        });

        expect(built.rules['create']).not.toHaveBeenCalled();
        expect(built.rules['update']).toHaveBeenCalledWith('r1', { categoryId: 'new', label: 'padaria' }, existing);
        expect(rule.categoryId).toBe('new');
        expect(built.ruleAction).toHaveBeenCalledWith('updated', 'contains');
    });

    it('devolve a regra existente se a atualização não achar a linha', async () => {
        const existing: CategoryRule = makeRule({ id: 'r1', pattern: 'PADARIA' });
        const built: Built = build(existing);
        built.rules['update']?.mockResolvedValue(null);

        const rule: CategoryRule = await built.service.upsertFromCorrection({
            matchType: 'contains',
            pattern: 'PADARIA',
            label: 'x',
            appliesTo: 'any',
            categoryId: 'c1'
        });

        expect(rule).toBe(existing);
    });

    it('corta o label em 80 caracteres', async () => {
        const built: Built = build(null);

        await built.service.upsertFromCorrection({
            matchType: 'contains',
            pattern: 'PADARIA',
            label: 'x'.repeat(200),
            appliesTo: 'any',
            categoryId: 'c1'
        });

        expect((built.rules['create']?.mock.calls[0]?.[0] as { label: string }).label).toHaveLength(80);
    });

    it('recusa categoria inexistente sem gravar', async () => {
        const built: Built = build(null);

        await expect(
            built.service.upsertFromCorrection({
                matchType: 'contains',
                pattern: 'PADARIA',
                label: 'x',
                appliesTo: 'any',
                categoryId: 'missing'
            })
        ).rejects.toBeInstanceOf(CategoryNotFoundError);
        expect(built.rules['create']).not.toHaveBeenCalled();
    });
});

describe('CategoryRuleService.listForCompany', () => {
    it('lista as regras do domínio', async () => {
        const built: Built = build(null);

        await expect(built.service.listForCompany()).resolves.toEqual([]);
    });
});
