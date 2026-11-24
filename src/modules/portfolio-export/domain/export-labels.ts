import { AppLocale } from '../../../shared/i18n/locale';

export interface ExportHeaders {
    readonly symbol: string;
    readonly name: string;
    readonly className: string;
    readonly titleKind: string;
    readonly issuer: string;
    readonly group: string;
    readonly quantity: string;
    readonly value: string;
    readonly valueSource: string;
    readonly holder: string;
}

interface LocaleLabels {
    readonly sheetName: string;
    readonly headers: ExportHeaders;
    readonly sources: Readonly<Record<string, string>>;
    readonly titleKinds: Readonly<Record<string, string>>;
    readonly wholeAccount: string;
}

export const EXPORT_LABELS: Readonly<Record<AppLocale, LocaleLabels>> = {
    'pt-BR': {
        sheetName: 'Carteira',
        headers: {
            symbol: 'Ativo',
            name: 'Nome',
            className: 'Classe',
            titleKind: 'Tipo',
            issuer: 'Emissor',
            group: 'Conglomerado',
            quantity: 'Quantidade',
            value: 'Valor',
            valueSource: 'Fonte do valor',
            holder: 'Titular'
        },
        sources: {
            brapi: 'B3 via brapi',
            finnhub: 'Finnhub',
            twelvedata: 'Twelve Data',
            alphavantage: 'Alpha Vantage',
            coingecko: 'CoinGecko',
            tesouro_direto: 'Preço oficial do Tesouro',
            cvm: 'Cota oficial da CVM',
            curve_cdi: 'Curva do CDI (BC)',
            curve_pre: 'Taxa contratada',
            curve_ipca: 'IPCA + taxa (BC)'
        },
        titleKinds: { cdb: 'CDB', lci: 'LCI', lca: 'LCA', lc: 'LC', debenture: 'Debênture', cri: 'CRI', cra: 'CRA' },
        wholeAccount: 'Conta toda'
    },
    en: {
        sheetName: 'Portfolio',
        headers: {
            symbol: 'Asset',
            name: 'Name',
            className: 'Class',
            titleKind: 'Type',
            issuer: 'Issuer',
            group: 'Group',
            quantity: 'Quantity',
            value: 'Value',
            valueSource: 'Value source',
            holder: 'Holder'
        },
        sources: {
            brapi: 'B3 via brapi',
            finnhub: 'Finnhub',
            twelvedata: 'Twelve Data',
            alphavantage: 'Alpha Vantage',
            coingecko: 'CoinGecko',
            tesouro_direto: 'Official Treasury price',
            cvm: 'Official CVM quota',
            curve_cdi: 'CDI curve (BC)',
            curve_pre: 'Contracted rate',
            curve_ipca: 'IPCA + rate (BC)'
        },
        titleKinds: { cdb: 'CDB', lci: 'LCI', lca: 'LCA', lc: 'LC', debenture: 'Debenture', cri: 'CRI', cra: 'CRA' },
        wholeAccount: 'Whole account'
    }
};

export function sheetNameOf(locale: AppLocale): string {
    return EXPORT_LABELS[locale].sheetName;
}

export function sourceLabelOf(source: string, locale: AppLocale): string {
    return EXPORT_LABELS[locale].sources[source] ?? source;
}

export function titleKindLabelOf(kind: string, locale: AppLocale): string {
    return EXPORT_LABELS[locale].titleKinds[kind] ?? kind;
}

export function wholeAccountLabelOf(locale: AppLocale): string {
    return EXPORT_LABELS[locale].wholeAccount;
}

export function headerLabelsOf(locale: AppLocale, baseCurrency: string): readonly string[] {
    const headers: ExportHeaders = EXPORT_LABELS[locale].headers;
    return [
        headers.symbol,
        headers.name,
        headers.className,
        headers.titleKind,
        headers.issuer,
        headers.group,
        headers.quantity,
        `${headers.value} (${baseCurrency})`,
        headers.valueSource,
        headers.holder
    ];
}
