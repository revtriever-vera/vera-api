import { describe, expect, it, vi } from 'vitest';
import { makeRule } from '../../../../test/support/spending-factories';
import { CategoryRulesRepository } from '../repositories/category-rules.repository';
import { CategoryLimitReachedError, RuleConflictError } from './categories.errors';
import { CategoryRuleDomain } from './category-rule.domain';

function build(repository: Record<string, ReturnType<typeof vi.fn>>): CategoryRuleDomain {
    return new CategoryRuleDomain(repository as unknown as CategoryRulesRepository);
}

const INPUT = { categoryId: 'c1', matchType: 'contains', pattern: 'PADARIA', label: 'padaria', appliesTo: 'out' } as const;

describe('CategoryRuleDomain.create', () => {
    it('cria a regra quando há espaço e não existe igual', async () => {
        const created = makeRule({ id: 'r1' });
        const domain: CategoryRuleDomain = build({
            countActive: vi.fn().mockResolvedValue(3),
            createIfAbsent: vi.fn().mockResolvedValue(created)
        });

        await expect(domain.create(INPUT)).resolves.toBe(created);
    });

    it('recusa a 501ª regra', async () => {
        const createIfAbsent: ReturnType<typeof vi.fn> = vi.fn();
        const domain: CategoryRuleDomain = build({ countActive: vi.fn().mockResolvedValue(500), createIfAbsent });

        await expect(domain.create(INPUT)).rejects.toBeInstanceOf(CategoryLimitReachedError);
        expect(createIfAbsent).not.toHaveBeenCalled();
    });

    it('duplicata devolve 409 com o id da regra existente', async () => {
        const domain: CategoryRuleDomain = build({
            countActive: vi.fn().mockResolvedValue(0),
            createIfAbsent: vi.fn().mockResolvedValue(null),
            findByMatch: vi.fn().mockResolvedValue(makeRule({ id: 'existing' }))
        });

        await expect(domain.create(INPUT)).rejects.toMatchObject({ code: 'categories.rule_conflict', meta: { ruleId: 'existing' } });
    });

    it('duplicata apagada no meio da corrida ainda vira conflito', async () => {
        const domain: CategoryRuleDomain = build({
            countActive: vi.fn().mockResolvedValue(0),
            createIfAbsent: vi.fn().mockResolvedValue(null),
            findByMatch: vi.fn().mockResolvedValue(null)
        });

        await expect(domain.create(INPUT)).rejects.toBeInstanceOf(RuleConflictError);
    });
});

describe('CategoryRuleDomain.update', () => {
    it('muda a direção quando não há gêmea', async () => {
        const current = makeRule({ id: 'r1', pattern: 'PADARIA' });
        const updateFields: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(current);
        const domain: CategoryRuleDomain = build({ findByMatch: vi.fn().mockResolvedValue(null), updateFields });

        await expect(domain.update('r1', { appliesTo: 'in' }, current)).resolves.toBe(current);
        expect(updateFields).toHaveBeenCalledWith('r1', { appliesTo: 'in' });
    });

    it('ignora a própria regra como gêmea', async () => {
        const current = makeRule({ id: 'r1' });
        const domain: CategoryRuleDomain = build({
            findByMatch: vi.fn().mockResolvedValue(current),
            updateFields: vi.fn().mockResolvedValue(current)
        });

        await expect(domain.update('r1', { appliesTo: 'any' }, current)).resolves.toBe(current);
    });

    it('recusa mudar a direção para uma combinação que outra regra já ocupa', async () => {
        const current = makeRule({ id: 'r1' });
        const domain: CategoryRuleDomain = build({ findByMatch: vi.fn().mockResolvedValue(makeRule({ id: 'r2' })), updateFields: vi.fn() });

        await expect(domain.update('r1', { appliesTo: 'in' }, current)).rejects.toMatchObject({ meta: { ruleId: 'r2' } });
    });

    it('trocar só a categoria não consulta duplicata', async () => {
        const current = makeRule({ id: 'r1' });
        const findByMatch: ReturnType<typeof vi.fn> = vi.fn();
        const domain: CategoryRuleDomain = build({ findByMatch, updateFields: vi.fn().mockResolvedValue(current) });

        await domain.update('r1', { categoryId: 'c2' }, current);

        expect(findByMatch).not.toHaveBeenCalled();
    });
});

describe('CategoryRuleDomain leituras e remoções', () => {
    it('delega listagem, busca e remoção', async () => {
        const rule = makeRule({ id: 'r1' });
        const softDelete: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
        const softDeleteByCategory: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([rule]);
        const domain: CategoryRuleDomain = build({
            listNewestFirst: vi.fn().mockResolvedValue([rule]),
            findById: vi.fn().mockResolvedValue(rule),
            findByMatch: vi.fn().mockResolvedValue(rule),
            softDelete,
            softDeleteByCategory
        });

        await expect(domain.listActive()).resolves.toEqual([rule]);
        await expect(domain.findById('r1')).resolves.toBe(rule);
        await expect(domain.findByMatch('contains', 'PADARIA', 'any')).resolves.toBe(rule);
        await domain.remove('r1');
        await expect(domain.removeByCategory('c1')).resolves.toEqual([rule]);
        expect(softDelete).toHaveBeenCalledWith('r1');
        expect(softDeleteByCategory).toHaveBeenCalledWith('c1');
    });
});
