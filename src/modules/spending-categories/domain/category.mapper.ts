import {
    CATEGORY_KINDS,
    CategoryKind,
    CategoryRule,
    CategoryView,
    FLEXIBILITIES,
    Flexibility,
    ICON_KEYS,
    IconKey,
    RULE_DIRECTIONS,
    RULE_MATCH_TYPES,
    RuleDirection,
    RuleMatchType,
    RuleView,
    SpendingCategory
} from './categories.types';

function oneOf<T extends string>(values: readonly T[], value: string, fallback: T): T {
    return values.find((candidate: T): boolean => candidate === value) ?? fallback;
}

export function toKind(value: string): CategoryKind {
    return oneOf(Object.values(CATEGORY_KINDS), value, CATEGORY_KINDS.expense);
}

export function toFlexibility(value: string | null): Flexibility | null {
    return value === null ? null : oneOf(Object.values(FLEXIBILITIES), value, FLEXIBILITIES.flexible);
}

export function toIcon(value: string): IconKey {
    return oneOf(ICON_KEYS, value, 'CircleEllipsis');
}

export function toMatchType(value: string): RuleMatchType {
    return oneOf(Object.values(RULE_MATCH_TYPES), value, RULE_MATCH_TYPES.description);
}

export function toDirection(value: string): RuleDirection {
    return oneOf(Object.values(RULE_DIRECTIONS), value, RULE_DIRECTIONS.any);
}

export function toCategoryView(category: SpendingCategory): CategoryView {
    return {
        id: category.id,
        systemKey: category.systemKey,
        name: category.name,
        kind: toKind(category.kind),
        flexibility: toFlexibility(category.flexibility),
        icon: toIcon(category.icon),
        position: category.position,
        isSystem: category.systemKey !== null
    };
}

export function toRuleView(rule: CategoryRule): RuleView {
    return {
        id: rule.id,
        matchType: toMatchType(rule.matchType),
        label: rule.label,
        appliesTo: toDirection(rule.appliesTo),
        categoryId: rule.categoryId,
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString()
    };
}
