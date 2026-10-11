import pluggyCategoryMapJson from '../data/pluggy-category-map.json';
import { PluggyCategoryEntry, pluggyCategoryMapSchema } from '../validation/data.schemas';
import { SYSTEM_CATEGORY_KEYS, SystemCategoryKey } from './categories.types';

export type PluggyIndex = ReadonlyMap<string, SystemCategoryKey>;

const PLUGGY_ID: RegExp = /^\d{8}$/;
const INCOME_ONLY: ReadonlySet<SystemCategoryKey> = new Set<SystemCategoryKey>([
    SYSTEM_CATEGORY_KEYS.income,
    SYSTEM_CATEGORY_KEYS.otherIncome
]);

export function buildPluggyIndex(entries: readonly PluggyCategoryEntry[]): PluggyIndex {
    return new Map<string, SystemCategoryKey>(
        entries.map((entry: PluggyCategoryEntry): [string, SystemCategoryKey] => [entry.pluggyId, entry.category])
    );
}

function candidateIds(providerCategoryId: string): readonly string[] {
    return [providerCategoryId, `${providerCategoryId.slice(0, 4)}0000`, `${providerCategoryId.slice(0, 2)}000000`];
}

export function mapPluggyCategory(index: PluggyIndex, providerCategoryId: string | null, amountMinor: number): SystemCategoryKey | null {
    if (providerCategoryId === null || !PLUGGY_ID.test(providerCategoryId)) {
        return null;
    }
    const found: string | undefined = candidateIds(providerCategoryId).find((id: string): boolean => index.has(id));
    const category: SystemCategoryKey | undefined = found === undefined ? undefined : index.get(found);
    if (category === undefined || (INCOME_ONLY.has(category) && amountMinor <= 0)) {
        return null;
    }
    return category;
}

export const PLUGGY_CATEGORY_INDEX: PluggyIndex = buildPluggyIndex(pluggyCategoryMapSchema.parse(pluggyCategoryMapJson));
