import { AppLocale } from '../../../shared/i18n/locale';

export interface ExportHeaders {
    readonly symbol: string;
    readonly name: string;
    readonly className: string;
    readonly quantity: string;
    readonly value: string;
    readonly valueSource: string;
}

interface LocaleLabels {
    readonly sheetName: string;
    readonly headers: ExportHeaders;
    readonly sources: Readonly<Record<string, string>>;
}

export const EXPORT_LABELS: Readonly<Record<AppLocale, LocaleLabels>> = {
    'pt-BR': {
        sheetName: 'Carteira',
        headers: {
            symbol: 'Ativo',
            name: 'Nome',
            className: 'Classe',
            quantity: 'Quantidade',
            value: 'Valor',
            valueSource: 'Fonte do valor'
        },
        sources: {
            brapi: 'B3 via brapi',
            finnhub: 'Finnhub',
            twelvedata: 'Twelve Data',
            alphavantage: 'Alpha Vantage',
            coingecko: 'CoinGecko',
            tesouro_direto: 'Preço oficial do Tesouro',
            curve_cdi: 'Curva do CDI (BC)',
            curve_pre: 'Taxa contratada',
            curve_ipca: 'IPCA + taxa (BC)'
        }
    },
    en: {
        sheetName: 'Portfolio',
        headers: {
            symbol: 'Asset',
            name: 'Name',
            className: 'Class',
            quantity: 'Quantity',
            value: 'Value',
            valueSource: 'Value source'
        },
        sources: {
            brapi: 'B3 via brapi',
            finnhub: 'Finnhub',
            twelvedata: 'Twelve Data',
            alphavantage: 'Alpha Vantage',
            coingecko: 'CoinGecko',
            tesouro_direto: 'Official Treasury price',
            curve_cdi: 'CDI curve (BC)',
            curve_pre: 'Contracted rate',
            curve_ipca: 'IPCA + rate (BC)'
        }
    }
};

export function sheetNameOf(locale: AppLocale): string {
    return EXPORT_LABELS[locale].sheetName;
}

export function sourceLabelOf(source: string, locale: AppLocale): string {
    return EXPORT_LABELS[locale].sources[source] ?? source;
}

export function headerLabelsOf(locale: AppLocale, baseCurrency: string): readonly string[] {
    const headers: ExportHeaders = EXPORT_LABELS[locale].headers;
    return [headers.symbol, headers.name, headers.className, headers.quantity, `${headers.value} (${baseCurrency})`, headers.valueSource];
}
