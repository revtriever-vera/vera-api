import { CategoryRule, SpendingCategory } from '../../src/modules/spending-categories/domain/categories.types';

let sequence: number = 0;

export function makeCategory(overrides: Partial<SpendingCategory> = {}): SpendingCategory {
    sequence += 1;
    return {
        id: `category-${String(sequence)}`,
        companyId: 'company-1',
        systemKey: null,
        name: `Categoria ${String(sequence)}`,
        kind: 'expense',
        flexibility: 'flexible',
        icon: 'Home',
        position: sequence,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        ...overrides
    };
}

export function makeRule(overrides: Partial<CategoryRule> = {}): CategoryRule {
    sequence += 1;
    return {
        id: `rule-${String(sequence)}`,
        companyId: 'company-1',
        categoryId: 'category-1',
        matchType: 'contains',
        pattern: `PADRAO ${String(sequence)}`,
        label: `padrão ${String(sequence)}`,
        appliesTo: 'any',
        isSample: false,
        createdAt: new Date('2026-10-01T10:00:00.000Z'),
        updatedAt: new Date('2026-10-01T10:00:00.000Z'),
        deletedAt: null,
        ...overrides
    };
}
