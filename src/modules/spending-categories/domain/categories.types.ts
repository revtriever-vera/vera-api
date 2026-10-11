import { Insertable, Selectable } from 'kysely';
import { CategoryRules, SpendingCategories } from '../../../core/database/generated/database.types';

export type SpendingCategory = Selectable<SpendingCategories>;
export type NewSpendingCategory = Insertable<SpendingCategories>;
export type CategoryRule = Selectable<CategoryRules>;
export type NewCategoryRule = Insertable<CategoryRules>;

export const CATEGORY_KINDS = {
    expense: 'expense',
    income: 'income',
    transfer: 'transfer'
} as const;

export type CategoryKind = (typeof CATEGORY_KINDS)[keyof typeof CATEGORY_KINDS];

export const USER_CATEGORY_KINDS = [CATEGORY_KINDS.expense, CATEGORY_KINDS.income] as const;

export const FLEXIBILITIES = {
    fixed: 'fixed',
    flexible: 'flexible'
} as const;

export type Flexibility = (typeof FLEXIBILITIES)[keyof typeof FLEXIBILITIES];

export const ICON_KEYS = [
    'Home',
    'BookOpen',
    'HeartPulse',
    'Wrench',
    'Landmark',
    'ShoppingCart',
    'UtensilsCrossed',
    'Car',
    'Film',
    'Repeat',
    'ShoppingBag',
    'CircleEllipsis',
    'TrendingUp',
    'PlusCircle',
    'ArrowLeftRight',
    'CreditCard',
    'PiggyBank',
    'Plane',
    'Gift',
    'PawPrint',
    'Dumbbell',
    'Baby',
    'Coffee',
    'Briefcase'
] as const;

export type IconKey = (typeof ICON_KEYS)[number];

export const SYSTEM_CATEGORY_KEYS = {
    housing: 'housing',
    education: 'education',
    health: 'health',
    homeServices: 'home_services',
    taxesFees: 'taxes_fees',
    groceries: 'groceries',
    eatingOut: 'eating_out',
    transport: 'transport',
    leisure: 'leisure',
    subscriptions: 'subscriptions',
    shopping: 'shopping',
    otherExpenses: 'other_expenses',
    income: 'income',
    otherIncome: 'other_income',
    ownTransfer: 'own_transfer',
    cardPayment: 'card_payment',
    investments: 'investments'
} as const;

export type SystemCategoryKey = (typeof SYSTEM_CATEGORY_KEYS)[keyof typeof SYSTEM_CATEGORY_KEYS];

export const RULE_MATCH_TYPES = {
    counterparty: 'counterparty',
    description: 'description',
    contains: 'contains'
} as const;

export type RuleMatchType = (typeof RULE_MATCH_TYPES)[keyof typeof RULE_MATCH_TYPES];

export const USER_RULE_MATCH_TYPES = [RULE_MATCH_TYPES.description, RULE_MATCH_TYPES.contains] as const;

export const RULE_DIRECTIONS = {
    out: 'out',
    in: 'in',
    any: 'any'
} as const;

export type RuleDirection = (typeof RULE_DIRECTIONS)[keyof typeof RULE_DIRECTIONS];

export const CATEGORIZATION_SOURCES = {
    rule: 'rule',
    dictionary: 'dictionary',
    provider: 'provider',
    none: 'none'
} as const;

export type CategorizationSource = (typeof CATEGORIZATION_SOURCES)[keyof typeof CATEGORIZATION_SOURCES];

export const CATEGORY_ACTIONS = {
    created: 'created',
    renamed: 'renamed',
    flexibilityChanged: 'flexibility_changed',
    removed: 'removed'
} as const;

export type CategoryAction = (typeof CATEGORY_ACTIONS)[keyof typeof CATEGORY_ACTIONS];

export const RULE_ACTIONS = {
    created: 'created',
    updated: 'updated',
    removed: 'removed',
    learned: 'learned'
} as const;

export type RuleAction = (typeof RULE_ACTIONS)[keyof typeof RULE_ACTIONS];

export const MAX_USER_CATEGORIES: number = 50;
export const MAX_RULES_PER_COMPANY: number = 500;
export const CATEGORY_NAME_MIN_LENGTH: number = 1;
export const CATEGORY_NAME_MAX_LENGTH: number = 40;
export const RULE_PATTERN_MIN_LENGTH: number = 2;
export const RULE_PATTERN_MAX_LENGTH: number = 80;
export const RULE_PATTERN_INPUT_MAX_LENGTH: number = 120;
export const RULE_LABEL_MAX_LENGTH: number = 80;
export const DESCRIPTION_MAX_LENGTH: number = 120;
export const CATEGORY_LIST_LIMIT: number = 200;
export const RULE_LIST_LIMIT: number = 600;

export interface CategorizationInput {
    readonly amountMinor: number;
    readonly normalizedDescription: string;
    readonly counterpartyKey: string | null;
    readonly providerCategoryId: string | null;
}

export interface CategorizationResult {
    readonly categoryId: string | null;
    readonly source: CategorizationSource;
    readonly ruleId: string | null;
}

export interface CategoryView {
    readonly id: string;
    readonly systemKey: string | null;
    readonly name: string | null;
    readonly kind: CategoryKind;
    readonly flexibility: Flexibility | null;
    readonly icon: IconKey;
    readonly position: number;
    readonly isSystem: boolean;
}

export interface RuleView {
    readonly id: string;
    readonly matchType: RuleMatchType;
    readonly label: string;
    readonly appliesTo: RuleDirection;
    readonly categoryId: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export interface CorrectionRuleInput {
    readonly matchType: RuleMatchType;
    readonly pattern: string;
    readonly label: string;
    readonly appliesTo: RuleDirection;
    readonly categoryId: string;
    readonly isSample?: boolean;
}
