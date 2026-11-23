import type { SpendingCategory } from '../../spending-categories/services/category-reader.service';
import { AppLocale } from '../../../shared/i18n/locale';
import { LabelSource } from './context/ai-context.types';
import { AssignedKey, ContextKeys } from './context/context-keys';
import { defaultCategoryLabel } from './context/default-labels';

export const UNCATEGORIZED_KEY: string = 'sem_categoria';
const UNCATEGORIZED_NAME: Readonly<Record<AppLocale, string>> = { 'pt-BR': 'Sem categoria', en: 'Uncategorized' };

export interface KeyedCategory {
    readonly categoryId: string | null;
    readonly assigned: AssignedKey;
}

export interface CategoryKeying {
    readonly entries: readonly KeyedCategory[];
    readonly keys: ReadonlyMap<string, LabelSource>;
}

export function keyCategories(categories: readonly SpendingCategory[], locale: AppLocale): CategoryKeying {
    const keys: ContextKeys = new ContextKeys();
    const entries: KeyedCategory[] = categories
        .filter((category: SpendingCategory): boolean => category.kind === 'expense')
        .map((category: SpendingCategory): KeyedCategory => {
            const defaultLabel: string | null = defaultCategoryLabel(category.systemKey, locale);
            const realName: string = category.name ?? defaultLabel ?? category.systemKey ?? '';
            return {
                categoryId: category.id,
                assigned: keys.assign({ kind: 'cat', systemKey: category.systemKey, realName, defaultLabel })
            };
        });
    const name: string = UNCATEGORIZED_NAME[locale];
    entries.push({
        categoryId: null,
        assigned: keys.assign({ kind: 'cat', systemKey: UNCATEGORIZED_KEY, realName: name, defaultLabel: name })
    });
    return { entries, keys: keys.all() };
}
