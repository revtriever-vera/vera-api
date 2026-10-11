import { describe, expect, it } from 'vitest';
import { makeCategory, makeRule } from '../../../../test/support/spending-factories';
import { toCategoryView, toDirection, toFlexibility, toIcon, toKind, toMatchType, toRuleView } from './category.mapper';

describe('category.mapper', () => {
    it('monta a visão da categoria padrão e da categoria do usuário', () => {
        expect(
            toCategoryView(makeCategory({ id: 'c1', systemKey: 'housing', name: null, flexibility: 'fixed', icon: 'Home', position: 1 }))
        ).toEqual({
            id: 'c1',
            systemKey: 'housing',
            name: null,
            kind: 'expense',
            flexibility: 'fixed',
            icon: 'Home',
            position: 1,
            isSystem: true
        });
        expect(toCategoryView(makeCategory({ systemKey: null, name: 'Pets' })).isSystem).toBe(false);
    });

    it('monta a visão da regra com datas ISO', () => {
        const view = toRuleView(
            makeRule({ id: 'r1', matchType: 'counterparty', appliesTo: 'in', label: 'Maria Souza', pattern: 'secret-key' })
        );

        expect(view).toEqual({
            id: 'r1',
            matchType: 'counterparty',
            label: 'Maria Souza',
            appliesTo: 'in',
            categoryId: 'category-1',
            createdAt: '2026-10-01T10:00:00.000Z',
            updatedAt: '2026-10-01T10:00:00.000Z'
        });
        expect(JSON.stringify(view)).not.toContain('secret-key');
    });

    it('valor desconhecido do banco cai num padrão seguro', () => {
        expect(toKind('weird')).toBe('expense');
        expect(toKind('transfer')).toBe('transfer');
        expect(toFlexibility('weird')).toBe('flexible');
        expect(toFlexibility(null)).toBeNull();
        expect(toIcon('NotAnIcon')).toBe('CircleEllipsis');
        expect(toMatchType('weird')).toBe('description');
        expect(toDirection('weird')).toBe('any');
    });
});
