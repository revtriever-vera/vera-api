import {
    CATEGORY_KINDS,
    CategoryKind,
    FLEXIBILITIES,
    Flexibility,
    IconKey,
    SYSTEM_CATEGORY_KEYS,
    SystemCategoryKey
} from './categories.types';

export interface SystemCategorySeed {
    readonly systemKey: SystemCategoryKey;
    readonly kind: CategoryKind;
    readonly flexibility: Flexibility | null;
    readonly icon: IconKey;
    readonly position: number;
}

const EXPENSE: CategoryKind = CATEGORY_KINDS.expense;
const INCOME: CategoryKind = CATEGORY_KINDS.income;
const TRANSFER: CategoryKind = CATEGORY_KINDS.transfer;
const FIXED: Flexibility = FLEXIBILITIES.fixed;
const FLEXIBLE: Flexibility = FLEXIBILITIES.flexible;

export const SYSTEM_CATEGORIES: readonly SystemCategorySeed[] = [
    { systemKey: SYSTEM_CATEGORY_KEYS.housing, kind: EXPENSE, flexibility: FIXED, icon: 'Home', position: 1 },
    { systemKey: SYSTEM_CATEGORY_KEYS.education, kind: EXPENSE, flexibility: FIXED, icon: 'BookOpen', position: 2 },
    { systemKey: SYSTEM_CATEGORY_KEYS.health, kind: EXPENSE, flexibility: FIXED, icon: 'HeartPulse', position: 3 },
    { systemKey: SYSTEM_CATEGORY_KEYS.homeServices, kind: EXPENSE, flexibility: FIXED, icon: 'Wrench', position: 4 },
    { systemKey: SYSTEM_CATEGORY_KEYS.taxesFees, kind: EXPENSE, flexibility: FIXED, icon: 'Landmark', position: 5 },
    { systemKey: SYSTEM_CATEGORY_KEYS.groceries, kind: EXPENSE, flexibility: FLEXIBLE, icon: 'ShoppingCart', position: 6 },
    { systemKey: SYSTEM_CATEGORY_KEYS.eatingOut, kind: EXPENSE, flexibility: FLEXIBLE, icon: 'UtensilsCrossed', position: 7 },
    { systemKey: SYSTEM_CATEGORY_KEYS.transport, kind: EXPENSE, flexibility: FLEXIBLE, icon: 'Car', position: 8 },
    { systemKey: SYSTEM_CATEGORY_KEYS.leisure, kind: EXPENSE, flexibility: FLEXIBLE, icon: 'Film', position: 9 },
    { systemKey: SYSTEM_CATEGORY_KEYS.subscriptions, kind: EXPENSE, flexibility: FLEXIBLE, icon: 'Repeat', position: 10 },
    { systemKey: SYSTEM_CATEGORY_KEYS.shopping, kind: EXPENSE, flexibility: FLEXIBLE, icon: 'ShoppingBag', position: 11 },
    { systemKey: SYSTEM_CATEGORY_KEYS.otherExpenses, kind: EXPENSE, flexibility: FLEXIBLE, icon: 'CircleEllipsis', position: 12 },
    { systemKey: SYSTEM_CATEGORY_KEYS.income, kind: INCOME, flexibility: null, icon: 'TrendingUp', position: 13 },
    { systemKey: SYSTEM_CATEGORY_KEYS.otherIncome, kind: INCOME, flexibility: null, icon: 'PlusCircle', position: 14 },
    { systemKey: SYSTEM_CATEGORY_KEYS.ownTransfer, kind: TRANSFER, flexibility: null, icon: 'ArrowLeftRight', position: 15 },
    { systemKey: SYSTEM_CATEGORY_KEYS.cardPayment, kind: TRANSFER, flexibility: null, icon: 'CreditCard', position: 16 },
    { systemKey: SYSTEM_CATEGORY_KEYS.investments, kind: TRANSFER, flexibility: null, icon: 'PiggyBank', position: 17 }
];

export const SYSTEM_KEYS: readonly SystemCategoryKey[] = SYSTEM_CATEGORIES.map((seed: SystemCategorySeed) => seed.systemKey);

const SYSTEM_KEY_SET: ReadonlySet<string> = new Set<string>(SYSTEM_KEYS);

export function isSystemCategoryKey(value: string): value is SystemCategoryKey {
    return SYSTEM_KEY_SET.has(value);
}
