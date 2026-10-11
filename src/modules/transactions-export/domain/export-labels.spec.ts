import { describe, expect, it } from 'vitest';
import { SpendingCategory } from '../../spending-categories/services/category-reader.service';
import { categoryLabelOf, EXPORT_LABELS, sheetNameOf } from './export-labels';

function categoryOf(systemKey: string | null, name: string | null): SpendingCategory {
    return { systemKey, name } as SpendingCategory;
}

describe('categoryLabelOf', () => {
    it('translates the default category by systemKey in both locales', () => {
        expect(categoryLabelOf(categoryOf('groceries', null), 'pt-BR')).toBe('Mercado');
        expect(categoryLabelOf(categoryOf('groceries', null), 'en')).toBe('Groceries');
    });

    it('uses the name when the user renamed or created the category', () => {
        expect(categoryLabelOf(categoryOf('groceries', 'Feira'), 'pt-BR')).toBe('Feira');
        expect(categoryLabelOf(categoryOf(null, 'Pets'), 'en')).toBe('Pets');
    });

    it('falls back to uncategorized without category or label', () => {
        expect(categoryLabelOf(undefined, 'pt-BR')).toBe('Sem categoria');
        expect(categoryLabelOf(undefined, 'en')).toBe('Uncategorized');
        expect(categoryLabelOf(categoryOf('unknown_key', null), 'en')).toBe('Uncategorized');
        expect(categoryLabelOf(categoryOf(null, null), 'pt-BR')).toBe('Sem categoria');
    });

    it('has a label for every default category in both locales', () => {
        expect(Object.keys(EXPORT_LABELS['pt-BR'].categories)).toHaveLength(17);
        expect(Object.keys(EXPORT_LABELS.en.categories)).toEqual(Object.keys(EXPORT_LABELS['pt-BR'].categories));
    });

    it('names the sheet by locale', () => {
        expect(sheetNameOf('pt-BR')).toBe('Transações');
        expect(sheetNameOf('en')).toBe('Transactions');
    });
});
