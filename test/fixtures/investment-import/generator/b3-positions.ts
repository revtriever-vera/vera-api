import { Cell, SheetTable } from './sheet.types';
import { SYNTHETIC_ADMINISTRATOR, SYNTHETIC_ACCOUNT, SYNTHETIC_BOOKKEEPER, SYNTHETIC_BROKER } from './synthetic-identity';
import { brDate, money } from './report-format';

export interface PositionAsset {
    readonly product: string;
    readonly ticker: string;
    readonly cnpj: string;
    readonly isin: string;
    readonly type: string;
    readonly quantity: number;
    readonly price: number;
}

export const STOCKS: readonly PositionAsset[] = [
    {
        product: 'PETR4 - PETROLEO BRASILEIRO S.A. PETROBRAS',
        ticker: 'PETR4',
        cnpj: '11.111.111/0001-00',
        isin: 'BREXEMACNPR0',
        type: 'PN',
        quantity: 227,
        price: 38.52
    },
    {
        product: 'VALE3 - VALE S.A.',
        ticker: 'VALE3',
        cnpj: '22.222.222/0001-00',
        isin: 'BREXEMACNOR0',
        type: 'ON',
        quantity: 100,
        price: 61.1
    },
    {
        product: 'ITUB4 - ITAU UNIBANCO HOLDING S.A.',
        ticker: 'ITUB4',
        cnpj: '33.333.333/0001-00',
        isin: 'BREXEMACNPR1',
        type: 'PN',
        quantity: 400,
        price: 33.45
    }
];

export const BDRS: readonly PositionAsset[] = [
    {
        product: 'AAPL34 - APPLE INC.',
        ticker: 'AAPL34',
        cnpj: '44.444.444/0001-00',
        isin: 'BREXEMBDR001',
        type: 'DRN',
        quantity: 80,
        price: 55.3
    }
];

export const ETFS: readonly PositionAsset[] = [
    {
        product: 'BOVA11 - ETF EXEMPLO IBOVESPA',
        ticker: 'BOVA11',
        cnpj: '55.555.555/0001-00',
        isin: 'BREXEMCTF001',
        type: 'Cotas',
        quantity: 50,
        price: 128.9
    },
    {
        product: 'IVVB11 - ETF EXEMPLO S&P 500',
        ticker: 'IVVB11',
        cnpj: '66.666.666/0001-00',
        isin: 'BREXEMCTF002',
        type: 'Cotas',
        quantity: 40,
        price: 305.7
    }
];

export const FUNDS: readonly PositionAsset[] = [
    {
        product: 'HGLG11 - FUNDO DE INVESTIMENTO IMOBILIARIO EXEMPLO LOGISTICA',
        ticker: 'HGLG11',
        cnpj: '77.777.777/0001-00',
        isin: 'BREXEMCTF003',
        type: 'Cotas',
        quantity: 60,
        price: 158.2
    },
    {
        product: 'XPML11 - FUNDO DE INVESTIMENTO IMOBILIARIO EXEMPLO SHOPPINGS',
        ticker: 'XPML11',
        cnpj: '88.888.888/0001-00',
        isin: 'BREXEMCTF004',
        type: 'Cotas',
        quantity: 90,
        price: 109.4
    }
];

const EQUITY_QUANTITY_HEADERS: readonly string[] = ['Quantidade', 'Quantidade Disponível', 'Quantidade Indisponível', 'Motivo'];

function equityQuantities(asset: PositionAsset): Cell[] {
    return [asset.quantity, asset.quantity, 0, null];
}

function equityValues(asset: PositionAsset): Cell[] {
    return [asset.price, money(asset.price * asset.quantity)];
}

export function buildStocksSheet(name: string, slug: string, assets: readonly PositionAsset[]): SheetTable {
    return {
        name,
        slug,
        headers: [
            'Produto',
            'Instituição',
            'Conta',
            'Código de Negociação',
            'CNPJ da Empresa',
            'Código ISIN / Distribuição',
            'Tipo',
            'Escriturador',
            ...EQUITY_QUANTITY_HEADERS,
            'Preço de Fechamento',
            'Valor Atualizado'
        ],
        rows: assets.map((asset: PositionAsset): Cell[] => [
            asset.product,
            SYNTHETIC_BROKER,
            SYNTHETIC_ACCOUNT,
            asset.ticker,
            asset.cnpj,
            asset.isin,
            asset.type,
            SYNTHETIC_BOOKKEEPER,
            ...equityQuantities(asset),
            ...equityValues(asset)
        ])
    };
}

export function buildFundsSheet(): SheetTable {
    return {
        name: 'Fundo de Investimento',
        slug: 'fundo-de-investimento',
        headers: [
            'Produto',
            'Instituição',
            'Conta',
            'Código de Negociação',
            'CNPJ do Fundo',
            'Código ISIN / Distribuição',
            'Tipo',
            'Administrador',
            ...EQUITY_QUANTITY_HEADERS,
            'Preço de Fechamento',
            'Valor Atualizado'
        ],
        rows: FUNDS.map((asset: PositionAsset): Cell[] => [
            asset.product,
            SYNTHETIC_BROKER,
            SYNTHETIC_ACCOUNT,
            asset.ticker,
            asset.cnpj,
            asset.isin,
            asset.type,
            SYNTHETIC_ADMINISTRATOR,
            ...equityQuantities(asset),
            ...equityValues(asset)
        ])
    };
}

interface TreasuryBond {
    readonly product: string;
    readonly isin: string;
    readonly indexer: string;
    readonly dueDate: string;
    readonly quantity: number;
    readonly invested: number;
    readonly gross: number;
    readonly net: number;
}

const TREASURY: readonly TreasuryBond[] = [
    {
        product: 'Tesouro Selic 2029',
        isin: 'BREXEMLFT001',
        indexer: 'SELIC',
        dueDate: '2029-03-01',
        quantity: 1.25,
        invested: 15200.4,
        gross: 16480.17,
        net: 16012.9
    },
    {
        product: 'Tesouro IPCA+ 2035',
        isin: 'BREXEMNTNB01',
        indexer: 'IPCA',
        dueDate: '2035-05-15',
        quantity: 3.4,
        invested: 8900.0,
        gross: 9714.55,
        net: 9391.2
    },
    {
        product: 'Tesouro Prefixado 2027',
        isin: 'BREXEMLTN001',
        indexer: 'PRE',
        dueDate: '2027-01-01',
        quantity: 5.0,
        invested: 3650.0,
        gross: 4021.88,
        net: 3897.3
    }
];

export function buildTreasurySheet(): SheetTable {
    return {
        name: 'Tesouro Direto',
        slug: 'tesouro-direto',
        headers: [
            'Produto',
            'Instituição',
            'Código ISIN',
            'Indexador',
            'Vencimento',
            'Quantidade',
            'Quantidade Disponível',
            'Quantidade Indisponível',
            'Motivo',
            'Valor Aplicado',
            'Valor bruto',
            'Valor líquido',
            'Valor Atualizado'
        ],
        rows: TREASURY.map((bond: TreasuryBond): Cell[] => [
            bond.product,
            SYNTHETIC_BROKER,
            bond.isin,
            bond.indexer,
            brDate(bond.dueDate),
            bond.quantity,
            bond.quantity,
            0,
            null,
            bond.invested,
            bond.gross,
            bond.net,
            bond.net
        ])
    };
}
