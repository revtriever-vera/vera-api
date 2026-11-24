import { ASSET_KINDS, AssetKind } from '../domain/catalog.types';
import { SourceAsset } from '../ports/asset-source.port';
import { CsvRow, csvRows, digitsOf, tidyName } from './cvm-csv';

export interface FundClass {
    readonly kind: AssetKind;
    readonly name: string;
    readonly active: boolean;
}

export interface EtfListing {
    readonly symbol: string;
    readonly cnpj: string;
}

export interface FundInformeColumns {
    readonly cnpj: string;
    readonly name: string;
    readonly market: string;
    readonly onExchange: string;
}

export const FII_INFORME_COLUMNS: FundInformeColumns = {
    cnpj: 'CNPJ_Fundo_Classe',
    name: 'Nome_Fundo_Classe',
    market: 'Mercado_Negociacao_Bolsa',
    onExchange: 'S'
};
export const FIAGRO_INFORME_COLUMNS: FundInformeColumns = {
    cnpj: 'CNPJ_Classe',
    name: 'Nome_Classe',
    market: 'Mercado_Negociacao',
    onExchange: 'BOLSA'
};

const TICKER_PATTERN: RegExp = /^[A-Z][A-Z0-9]{3}\d{1,2}$/;
const FUND_ISIN_PATTERN: RegExp = /^BR([A-Z0-9]{4})CTF[0-9A-Z]{3}$/;
const FUND_TICKER_SUFFIX: string = '11';
const ACTIVE_SITUATION: string = 'Em Funcionamento Normal';
const LISTED_MARKETS: ReadonlySet<string> = new Set<string>(['Bolsa', 'Balcão Organizado']);
const DEPOSITARY_APPLICATIONS: ReadonlySet<string> = new Set<string>([
    'Certificado ou recibo de depósito de valores mobiliários',
    'Brazilian Depository Receipt - BDR'
]);

const KIND_BY_SECURITY: Readonly<Record<string, AssetKind>> = {
    'ações ordinárias': ASSET_KINDS.stock,
    'ações preferenciais': ASSET_KINDS.stock,
    units: ASSET_KINDS.stock,
    'certificados de depósito de valores mobiliários': ASSET_KINDS.stock,
    bdrs: ASSET_KINDS.bdr
};

const KIND_BY_FUND_CLASS: Readonly<Record<string, AssetKind>> = {
    'Classes de Cotas de Fundos FII': ASSET_KINDS.fii,
    'Classes de Cotas de Fundos FIAGRO': ASSET_KINDS.fii,
    'Classes de Cotas de Fundos FIIM': ASSET_KINDS.etf
};

function brazilianAsset(ticker: string, name: string, kind: AssetKind, raw: Readonly<Record<string, string>>): SourceAsset {
    return { externalId: ticker, symbol: ticker, name: tidyName(name) || ticker, kind, currency: 'BRL', raw };
}

function versionKey(row: CsvRow): string {
    return `${row('Data_Referencia')}|${row('Versao').padStart(4, '0')}`;
}

function* allRows(texts: readonly string[], required: readonly string[]): Generator<CsvRow> {
    for (const text of texts) {
        yield* csvRows(text, required);
    }
}

function latestVersionByKey(texts: readonly string[], required: readonly string[], keyOf: (row: CsvRow) => string): Map<string, string> {
    const latest: Map<string, string> = new Map<string, string>();
    for (const row of allRows(texts, required)) {
        const key: string = keyOf(row);
        const version: string = versionKey(row);
        if (version > (latest.get(key) ?? '')) {
            latest.set(key, version);
        }
    }
    return latest;
}

function* latestRows(texts: readonly string[], required: readonly string[], keyOf: (row: CsvRow) => string): Generator<CsvRow> {
    const latest: Map<string, string> = latestVersionByKey(texts, required, keyOf);
    for (const row of allRows(texts, required)) {
        if (latest.get(keyOf(row)) === versionKey(row)) {
            yield row;
        }
    }
}

const LISTED_COLUMNS: readonly string[] = [
    'CNPJ_Companhia',
    'Data_Referencia',
    'Versao',
    'Nome_Empresarial',
    'Valor_Mobiliario',
    'Codigo_Negociacao',
    'Mercado',
    'Data_Fim_Negociacao'
];

function listedAsset(row: CsvRow): SourceAsset | null {
    const kind: AssetKind | undefined = KIND_BY_SECURITY[row('Valor_Mobiliario').toLowerCase()];
    const ticker: string = row('Codigo_Negociacao').toUpperCase();
    const tradable: boolean = LISTED_MARKETS.has(row('Mercado')) && row('Data_Fim_Negociacao') === '';
    if (kind === undefined || !tradable || !TICKER_PATTERN.test(ticker)) {
        return null;
    }
    return brazilianAsset(ticker, row('Nome_Empresarial'), kind, {
        cnpj: digitsOf(row('CNPJ_Companhia')),
        security: row('Valor_Mobiliario')
    });
}

export function parseListedCompanies(texts: readonly string[]): SourceAsset[] {
    const assets: SourceAsset[] = [];
    for (const row of latestRows(texts, LISTED_COLUMNS, (key: CsvRow): string => key('CNPJ_Companhia'))) {
        const asset: SourceAsset | null = listedAsset(row);
        if (asset !== null) {
            assets.push(asset);
        }
    }
    return assets;
}

export function parseFundClasses(text: string): ReadonlyMap<string, FundClass> {
    const classes: Map<string, FundClass> = new Map<string, FundClass>();
    for (const row of csvRows(text, ['CNPJ_Classe', 'Tipo_Classe', 'Denominacao_Social', 'Situacao'])) {
        const kind: AssetKind | undefined = KIND_BY_FUND_CLASS[row('Tipo_Classe')];
        if (kind !== undefined) {
            classes.set(digitsOf(row('CNPJ_Classe')), {
                kind,
                name: row('Denominacao_Social'),
                active: row('Situacao') === ACTIVE_SITUATION
            });
        }
    }
    return classes;
}

export function tickerOfFundIsin(isin: string): string | null {
    const root: string | undefined = FUND_ISIN_PATTERN.exec(isin.toUpperCase())?.[1];
    return root === undefined ? null : `${root}${FUND_TICKER_SUFFIX}`;
}

function fundAsset(row: CsvRow, columns: FundInformeColumns, classes: ReadonlyMap<string, FundClass>): SourceAsset | null {
    const cnpj: string = digitsOf(row(columns.cnpj));
    const fundClass: FundClass | undefined = classes.get(cnpj);
    const ticker: string | null = tickerOfFundIsin(row('Codigo_ISIN'));
    const listed: boolean = row(columns.market) === columns.onExchange;
    if (fundClass?.kind !== ASSET_KINDS.fii || !fundClass.active || !listed || ticker === null) {
        return null;
    }
    return brazilianAsset(ticker, row(columns.name) || fundClass.name, ASSET_KINDS.fii, { cnpj, isin: row('Codigo_ISIN') });
}

export function parseFundInforme(
    texts: readonly string[],
    columns: FundInformeColumns,
    classes: ReadonlyMap<string, FundClass>
): SourceAsset[] {
    const required: readonly string[] = [columns.cnpj, columns.name, columns.market, 'Codigo_ISIN', 'Data_Referencia', 'Versao'];
    const assets: SourceAsset[] = [];
    for (const row of latestRows(texts, required, (key: CsvRow): string => key(columns.cnpj))) {
        const asset: SourceAsset | null = fundAsset(row, columns, classes);
        if (asset !== null) {
            assets.push(asset);
        }
    }
    return assets;
}

export function etfAssets(listings: readonly EtfListing[], classes: ReadonlyMap<string, FundClass>): SourceAsset[] {
    const assets: SourceAsset[] = [];
    for (const listing of listings) {
        const fundClass: FundClass | undefined = classes.get(listing.cnpj);
        if (fundClass?.kind === ASSET_KINDS.etf && fundClass.active) {
            assets.push(brazilianAsset(listing.symbol, fundClass.name, ASSET_KINDS.etf, { cnpj: listing.cnpj }));
        }
    }
    return assets;
}

export function parseDepositaryReceipts(text: string): SourceAsset[] {
    const assets: Map<string, SourceAsset> = new Map<string, SourceAsset>();
    for (const row of csvRows(text, ['TP_APLIC', 'CD_ATIVO', 'DS_ATIVO', 'CD_ISIN'])) {
        const ticker: string = row('CD_ATIVO').toUpperCase();
        const kind: AssetKind | undefined = row('TP_APLIC') === 'Brazilian Depository Receipt - BDR' ? ASSET_KINDS.bdr : ASSET_KINDS.stock;
        if (DEPOSITARY_APPLICATIONS.has(row('TP_APLIC')) && TICKER_PATTERN.test(ticker) && !assets.has(ticker)) {
            assets.set(ticker, brazilianAsset(ticker, row('DS_ATIVO'), kind, { isin: row('CD_ISIN') }));
        }
    }
    return [...assets.values()];
}
