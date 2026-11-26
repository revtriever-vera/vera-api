import { AppLocale } from '../../../../shared/i18n/locale';

type Dictionary = Readonly<Record<string, Readonly<Record<AppLocale, string>>>>;

const CATEGORY_LABELS: Dictionary = {
    housing: { 'pt-BR': 'Moradia', en: 'Housing' },
    education: { 'pt-BR': 'Educação', en: 'Education' },
    health: { 'pt-BR': 'Saúde', en: 'Health' },
    home_services: { 'pt-BR': 'Casa e serviços', en: 'Home and services' },
    taxes_fees: { 'pt-BR': 'Impostos e tarifas', en: 'Taxes and fees' },
    groceries: { 'pt-BR': 'Mercado', en: 'Groceries' },
    eating_out: { 'pt-BR': 'Delivery e restaurantes', en: 'Delivery and restaurants' },
    transport: { 'pt-BR': 'Transporte', en: 'Transport' },
    leisure: { 'pt-BR': 'Lazer', en: 'Leisure' },
    subscriptions: { 'pt-BR': 'Assinaturas', en: 'Subscriptions' },
    shopping: { 'pt-BR': 'Compras', en: 'Shopping' },
    other_expenses: { 'pt-BR': 'Outros gastos', en: 'Other expenses' }
};

const CLASS_LABELS: Dictionary = {
    rf_pos: { 'pt-BR': 'Renda fixa pós', en: 'Floating-rate fixed income' },
    rf_pre: { 'pt-BR': 'Renda fixa pré', en: 'Fixed-rate fixed income' },
    rf_ipca: { 'pt-BR': 'Renda fixa IPCA+', en: 'Inflation-linked fixed income' },
    acoes_br: { 'pt-BR': 'Ações Brasil', en: 'Brazilian stocks' },
    fii: { 'pt-BR': 'FIIs', en: 'Brazilian REITs (FIIs)' },
    acoes_eua: { 'pt-BR': 'Ações EUA', en: 'US stocks' },
    reits: { 'pt-BR': 'REITs', en: 'US REITs' },
    cripto: { 'pt-BR': 'Cripto', en: 'Crypto' }
};

const BUCKET_LABELS: Dictionary = {
    missing_issuer: { 'pt-BR': 'Emissor não informado', en: 'Issuer not informed' },
    funds: { 'pt-BR': 'Fundos', en: 'Funds' },
    crypto: { 'pt-BR': 'Cripto', en: 'Crypto' },
    unmapped: { 'pt-BR': 'Emissor não mapeado', en: 'Unmapped issuer' }
};

function labelOf(dictionary: Dictionary, systemKey: string | null, locale: AppLocale): string | null {
    if (systemKey === null || !Object.hasOwn(dictionary, systemKey)) {
        return null;
    }
    return dictionary[systemKey]?.[locale] ?? null;
}

export function defaultCategoryLabel(systemKey: string | null, locale: AppLocale): string | null {
    return labelOf(CATEGORY_LABELS, systemKey, locale);
}

export function defaultClassLabel(systemKey: string | null, locale: AppLocale): string | null {
    return labelOf(CLASS_LABELS, systemKey, locale);
}

export function bucketLabel(key: string, locale: AppLocale): string {
    return labelOf(BUCKET_LABELS, key, locale) ?? key;
}
