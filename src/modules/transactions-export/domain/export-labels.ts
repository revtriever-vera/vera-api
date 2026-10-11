import { AppLocale } from '../../../shared/i18n/locale';
import { SpendingCategory } from '../../spending-categories/services/category-reader.service';
import { CategoryOriginKey, TransactionSourceKey } from './transactions-export.types';

export interface ExportHeaders {
    readonly date: string;
    readonly description: string;
    readonly counterparty: string;
    readonly amount: string;
    readonly currency: string;
    readonly category: string;
    readonly categoryOrigin: string;
    readonly account: string;
    readonly institution: string;
    readonly source: string;
}

interface LocaleLabels {
    readonly sheetName: string;
    readonly headers: ExportHeaders;
    readonly uncategorized: string;
    readonly origins: Readonly<Record<CategoryOriginKey, string>>;
    readonly sources: Readonly<Record<TransactionSourceKey, string>>;
    readonly categories: Readonly<Record<string, string>>;
}

export const EXPORT_LABELS: Readonly<Record<AppLocale, LocaleLabels>> = {
    'pt-BR': {
        sheetName: 'Transações',
        headers: {
            date: 'Data',
            description: 'Descrição',
            counterparty: 'Favorecido',
            amount: 'Valor',
            currency: 'Moeda',
            category: 'Categoria',
            categoryOrigin: 'Origem da categoria',
            account: 'Conta',
            institution: 'Instituição',
            source: 'Fonte'
        },
        uncategorized: 'Sem categoria',
        origins: { user: 'Sua correção', rule: 'Sua regra', dictionary: 'Dicionário', provider: 'Pluggy', none: '—' },
        sources: { pluggy: 'Open Finance (Meu Pluggy)', ofx: 'Arquivo OFX', csv: 'Arquivo CSV', sample: 'Exemplo' },
        categories: {
            housing: 'Moradia',
            education: 'Educação',
            health: 'Saúde',
            home_services: 'Casa e serviços',
            taxes_fees: 'Impostos e tarifas',
            groceries: 'Mercado',
            eating_out: 'Delivery e restaurantes',
            transport: 'Transporte',
            leisure: 'Lazer',
            subscriptions: 'Assinaturas',
            shopping: 'Compras',
            other_expenses: 'Outros gastos',
            income: 'Renda',
            other_income: 'Outras entradas',
            own_transfer: 'Transferência entre suas contas',
            card_payment: 'Pagamento de fatura',
            investments: 'Investimentos'
        }
    },
    en: {
        sheetName: 'Transactions',
        headers: {
            date: 'Date',
            description: 'Description',
            counterparty: 'Counterparty',
            amount: 'Amount',
            currency: 'Currency',
            category: 'Category',
            categoryOrigin: 'Category source',
            account: 'Account',
            institution: 'Institution',
            source: 'Source'
        },
        uncategorized: 'Uncategorized',
        origins: { user: 'Your correction', rule: 'Your rule', dictionary: 'Dictionary', provider: 'Pluggy', none: '—' },
        sources: { pluggy: 'Open Finance (Meu Pluggy)', ofx: 'OFX file', csv: 'CSV file', sample: 'Example' },
        categories: {
            housing: 'Housing',
            education: 'Education',
            health: 'Health',
            home_services: 'Home and services',
            taxes_fees: 'Taxes and fees',
            groceries: 'Groceries',
            eating_out: 'Delivery and restaurants',
            transport: 'Transport',
            leisure: 'Leisure',
            subscriptions: 'Subscriptions',
            shopping: 'Shopping',
            other_expenses: 'Other expenses',
            income: 'Income',
            other_income: 'Other income',
            own_transfer: 'Transfer between your accounts',
            card_payment: 'Card bill payment',
            investments: 'Investments'
        }
    }
};

export function sheetNameOf(locale: AppLocale): string {
    return EXPORT_LABELS[locale].sheetName;
}

export function originLabelOf(origin: CategoryOriginKey, locale: AppLocale): string {
    return EXPORT_LABELS[locale].origins[origin];
}

export function sourceLabelOf(source: TransactionSourceKey, locale: AppLocale): string {
    return EXPORT_LABELS[locale].sources[source];
}

export function categoryLabelOf(category: SpendingCategory | undefined, locale: AppLocale): string {
    const labels: LocaleLabels = EXPORT_LABELS[locale];
    if (category === undefined) {
        return labels.uncategorized;
    }
    if (category.name !== null) {
        return category.name;
    }
    return (category.systemKey === null ? undefined : labels.categories[category.systemKey]) ?? labels.uncategorized;
}
