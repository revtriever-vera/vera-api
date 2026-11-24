import { SYSTEM_CATEGORY_KEYS, SystemCategoryKey } from './categories.types';

/** Display names of the default categories (stored name is null; the label comes from the locale), so uniqueness can be checked against what people see. */
const SYSTEM_CATEGORY_NAMES: Readonly<Record<SystemCategoryKey, readonly [string, string]>> = {
    [SYSTEM_CATEGORY_KEYS.housing]: ['Moradia', 'Housing'],
    [SYSTEM_CATEGORY_KEYS.education]: ['Educação', 'Education'],
    [SYSTEM_CATEGORY_KEYS.health]: ['Saúde', 'Health'],
    [SYSTEM_CATEGORY_KEYS.homeServices]: ['Casa e serviços', 'Home and services'],
    [SYSTEM_CATEGORY_KEYS.taxesFees]: ['Impostos e tarifas', 'Taxes and fees'],
    [SYSTEM_CATEGORY_KEYS.groceries]: ['Mercado', 'Groceries'],
    [SYSTEM_CATEGORY_KEYS.eatingOut]: ['Delivery e restaurantes', 'Delivery and restaurants'],
    [SYSTEM_CATEGORY_KEYS.transport]: ['Transporte', 'Transport'],
    [SYSTEM_CATEGORY_KEYS.leisure]: ['Lazer', 'Leisure'],
    [SYSTEM_CATEGORY_KEYS.subscriptions]: ['Assinaturas', 'Subscriptions'],
    [SYSTEM_CATEGORY_KEYS.shopping]: ['Compras', 'Shopping'],
    [SYSTEM_CATEGORY_KEYS.otherExpenses]: ['Outros gastos', 'Other expenses'],
    [SYSTEM_CATEGORY_KEYS.income]: ['Renda', 'Income'],
    [SYSTEM_CATEGORY_KEYS.otherIncome]: ['Outras entradas', 'Other income'],
    [SYSTEM_CATEGORY_KEYS.ownTransfer]: ['Transferência entre suas contas', 'Transfer between your accounts'],
    [SYSTEM_CATEGORY_KEYS.cardPayment]: ['Pagamento de fatura', 'Card bill payment'],
    [SYSTEM_CATEGORY_KEYS.investments]: ['Investimentos', 'Investments']
};

export function foldCategoryName(name: string): string {
    return name
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim()
        .toLowerCase();
}

export function isSystemCategoryName(name: string, exceptKey: string | null): boolean {
    const folded: string = foldCategoryName(name);
    return (Object.entries(SYSTEM_CATEGORY_NAMES) as [SystemCategoryKey, readonly [string, string]][]).some(
        ([key, labels]: [SystemCategoryKey, readonly [string, string]]): boolean =>
            key !== exceptKey && labels.some((label: string): boolean => foldCategoryName(label) === folded)
    );
}
