import { AppLocale } from '../../../shared/i18n/locale';
import type { SpendingCategory } from '../../spending-categories/services/category-reader.service';
import { keyCategories, KeyedCategory } from '../domain/ask-category-keys';
import { defaultCategoryLabel } from '../domain/context/default-labels';

export function categoryOfKey(categories: readonly SpendingCategory[], key: string, locale: AppLocale): SpendingCategory | null {
    const entry: KeyedCategory | undefined = keyCategories(categories, locale).entries.find(
        (candidate: KeyedCategory): boolean => candidate.assigned.chave === key
    );
    if (entry?.categoryId === null || entry === undefined) {
        return null;
    }
    return categories.find((category: SpendingCategory): boolean => category.id === entry.categoryId) ?? null;
}

export function categoryLabelOf(category: SpendingCategory, locale: AppLocale): string {
    return category.name ?? defaultCategoryLabel(category.systemKey, locale) ?? category.systemKey ?? '';
}
