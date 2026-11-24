import { describe, expect, it } from 'vitest';
import { AppLocale } from '@src/shared/i18n/locale';
import { SYSTEM_CATEGORIES } from '@src/modules/spending-categories/domain/system-categories';
import { isSystemCategoryName } from '@src/modules/spending-categories/domain/system-category-names';
import { EXPORT_LABELS } from '@src/modules/transactions-export/domain/export-labels';

const LOCALES: readonly AppLocale[] = ['pt-BR', 'en'];

describe('nomes das categorias padrão', () => {
    it('a checagem de unicidade conhece exatamente os rótulos de exportação, em pt-BR e en', () => {
        const cases = LOCALES.flatMap((locale: AppLocale) =>
            SYSTEM_CATEGORIES.map((seed) => ({ key: seed.systemKey, label: EXPORT_LABELS[locale].categories[seed.systemKey] ?? '' }))
        );

        expect(cases.every((item) => item.label.length > 0)).toBe(true);
        expect(cases.every((item) => isSystemCategoryName(item.label, null))).toBe(true);
        expect(cases.some((item) => isSystemCategoryName(item.label, item.key))).toBe(false);
    });
});
