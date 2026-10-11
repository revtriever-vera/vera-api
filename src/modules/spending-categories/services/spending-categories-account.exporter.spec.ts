import { describe, expect, it, vi } from 'vitest';
import { makeCategory, makeRule } from '../../../../test/support/spending-factories';
import { CategoryRuleDomain } from '../domain/category-rule.domain';
import { SpendingCategoryDomain } from '../domain/spending-category.domain';
import { SpendingCategoriesAccountExporter } from './spending-categories-account.exporter';

describe('SpendingCategoriesAccountExporter', () => {
    it('exporta categorias e regras sem exemplo e sem a chave do favorecido', async () => {
        const exporter: SpendingCategoriesAccountExporter = new SpendingCategoriesAccountExporter(
            { listActive: vi.fn().mockResolvedValue([makeCategory({ id: 'c1', name: 'Pets' })]) } as unknown as SpendingCategoryDomain,
            {
                listActive: vi
                    .fn()
                    .mockResolvedValue([
                        makeRule({ id: 'r1', categoryId: 'c1', matchType: 'contains', pattern: 'PADARIA', label: 'padaria' }),
                        makeRule({ id: 'r2', categoryId: 'c1', matchType: 'counterparty', pattern: 'hmac-key', label: 'Maria Souza' }),
                        makeRule({ id: 'r3', isSample: true })
                    ])
            } as unknown as CategoryRuleDomain
        );

        const exported = await exporter.exportAll();

        expect(exporter.area).toBe('spending_categories');
        expect(exported.categories).toMatchObject([{ name: 'Pets', kind: 'expense' }]);
        expect(exported.rules.map((rule) => [rule.label, rule.pattern, rule.categoryKey])).toEqual([
            ['padaria', 'PADARIA', 'Pets'],
            ['Maria Souza', null, 'Pets']
        ]);
        expect(JSON.stringify(exported)).not.toContain('hmac-key');
        expect(JSON.stringify(exported)).not.toContain('c1');
    });
});
