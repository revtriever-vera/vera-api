import {
    PortfolioSourceData,
    SourceAsset,
    SourceAssignment,
    SourceClass,
    SourcePosition,
    SourceQuote,
    SourceRate,
    SourceTitle
} from '../../src/modules/portfolio/domain/portfolio.types';

export const PTAX_RATE: SourceRate = { brlPerUnit: '5.42', date: '2026-10-09', source: 'bcb-ptax' };

export const CLASS_TARGETS: Readonly<Record<string, number>> = {
    rf_pos: 2000,
    rf_pre: 800,
    rf_ipca: 1200,
    acoes_br: 1500,
    fii: 700,
    acoes_eua: 2500,
    reits: 800,
    cripto: 500
};

export function classIdOf(systemKey: string): string {
    return `class-${systemKey}`;
}

export function makeSourceClasses(): SourceClass[] {
    return Object.entries(CLASS_TARGETS).map(([systemKey, targetBps]: [string, number], index: number): SourceClass => ({
        id: classIdOf(systemKey),
        systemKey,
        name: null,
        displayName: systemKey,
        colorKey: `c${String(index + 1)}`,
        targetBps,
        sortOrder: index + 1
    }));
}

export interface PositionSeed {
    readonly symbol: string;
    readonly classKey: string;
    readonly market: string;
    readonly typeGroup: string;
    readonly currency: string;
    readonly quantity: string;
    readonly price: string;
    readonly dollarExposure?: boolean;
    readonly provider: string;
}

export const POSITION_SEEDS: readonly PositionSeed[] = [
    {
        symbol: 'TESOURO-SELIC-2029',
        classKey: 'rf_pos',
        market: 'TESOURO',
        typeGroup: 'tesouro',
        currency: 'BRL',
        quantity: '3.2',
        price: '16200',
        provider: 'tesouro'
    },
    {
        symbol: 'TESOURO-PRE-2027',
        classKey: 'rf_pre',
        market: 'TESOURO',
        typeGroup: 'tesouro',
        currency: 'BRL',
        quantity: '120',
        price: '812',
        provider: 'tesouro'
    },
    {
        symbol: 'TESOURO-IPCA-2035',
        classKey: 'rf_ipca',
        market: 'TESOURO',
        typeGroup: 'tesouro',
        currency: 'BRL',
        quantity: '60',
        price: '2150',
        provider: 'tesouro'
    },
    {
        symbol: 'ITUB4',
        classKey: 'acoes_br',
        market: 'B3',
        typeGroup: 'acoes_br',
        currency: 'BRL',
        quantity: '2000',
        price: '37.80',
        provider: 'brapi'
    },
    {
        symbol: 'WEGE3',
        classKey: 'acoes_br',
        market: 'B3',
        typeGroup: 'acoes_br',
        currency: 'BRL',
        quantity: '1500',
        price: '52.10',
        provider: 'brapi'
    },
    {
        symbol: 'PETR4',
        classKey: 'acoes_br',
        market: 'B3',
        typeGroup: 'acoes_br',
        currency: 'BRL',
        quantity: '1800',
        price: '36.90',
        provider: 'brapi'
    },
    {
        symbol: 'HGLG11',
        classKey: 'fii',
        market: 'B3',
        typeGroup: 'fii',
        currency: 'BRL',
        quantity: '400',
        price: '158.00',
        provider: 'brapi'
    },
    {
        symbol: 'KNRI11',
        classKey: 'fii',
        market: 'B3',
        typeGroup: 'fii',
        currency: 'BRL',
        quantity: '350',
        price: '152.00',
        provider: 'brapi'
    },
    {
        symbol: 'IVVB11',
        classKey: 'acoes_eua',
        market: 'B3',
        typeGroup: 'acoes_eua',
        currency: 'BRL',
        quantity: '300',
        price: '362.00',
        dollarExposure: true,
        provider: 'brapi'
    },
    {
        symbol: 'VOO',
        classKey: 'acoes_eua',
        market: 'US',
        typeGroup: 'acoes_eua',
        currency: 'USD',
        quantity: '40',
        price: '545',
        provider: 'finnhub'
    },
    {
        symbol: 'AAPL',
        classKey: 'acoes_eua',
        market: 'US',
        typeGroup: 'acoes_eua',
        currency: 'USD',
        quantity: '60',
        price: '228',
        provider: 'finnhub'
    },
    {
        symbol: 'MSFT',
        classKey: 'acoes_eua',
        market: 'US',
        typeGroup: 'acoes_eua',
        currency: 'USD',
        quantity: '30',
        price: '430',
        provider: 'finnhub'
    },
    {
        symbol: 'O',
        classKey: 'reits',
        market: 'US',
        typeGroup: 'reits',
        currency: 'USD',
        quantity: '300',
        price: '58',
        provider: 'finnhub'
    },
    {
        symbol: 'VNQ',
        classKey: 'reits',
        market: 'US',
        typeGroup: 'reits',
        currency: 'USD',
        quantity: '120',
        price: '92',
        provider: 'finnhub'
    },
    {
        symbol: 'BTC',
        classKey: 'cripto',
        market: 'CRYPTO',
        typeGroup: 'cripto',
        currency: 'USD',
        quantity: '0.45',
        price: '62000',
        provider: 'coingecko'
    },
    {
        symbol: 'ETH',
        classKey: 'cripto',
        market: 'CRYPTO',
        typeGroup: 'cripto',
        currency: 'USD',
        quantity: '4',
        price: '2600',
        provider: 'coingecko'
    }
];

interface TitleSeed {
    readonly name: string;
    readonly classKey: string;
    readonly valueMinor: number;
    readonly currency: string;
    readonly source: string;
}

const TITLE_SEEDS: readonly TitleSeed[] = [
    { name: 'CDB Inter', classKey: 'rf_pos', valueMinor: 18_240_000, currency: 'BRL', source: 'curve_cdi' },
    { name: 'LCI Itau', classKey: 'rf_pos', valueMinor: 13_490_000, currency: 'BRL', source: 'curve_cdi' },
    { name: 'Treasury 2027', classKey: 'rf_pre', valueMinor: 2_000_000, currency: 'USD', source: 'curve_pre' }
];

export interface PrototypeOverrides {
    readonly baseCurrency?: string;
    readonly toleranceBps?: number;
    readonly usdRate?: SourceRate | null;
    readonly withoutQuotes?: readonly string[];
}

function assetsOf(): SourceAsset[] {
    return POSITION_SEEDS.map((seed: PositionSeed): SourceAsset => ({
        id: `asset-${seed.symbol}`,
        symbol: seed.symbol,
        name: seed.symbol,
        market: seed.market,
        typeGroup: seed.typeGroup,
        currency: seed.currency,
        quantityDecimals: 0,
        dollarExposure: seed.dollarExposure ?? false
    }));
}

function positionsOf(): SourcePosition[] {
    return POSITION_SEEDS.map((seed: PositionSeed): SourcePosition => ({
        id: `position-${seed.symbol}`,
        assetId: `asset-${seed.symbol}`,
        quantity: seed.quantity
    }));
}

function quotesOf(withoutQuotes: readonly string[]): SourceQuote[] {
    return POSITION_SEEDS.filter((seed: PositionSeed) => !withoutQuotes.includes(seed.symbol)).map((seed: PositionSeed): SourceQuote => ({
        assetId: `asset-${seed.symbol}`,
        price: seed.price,
        currency: seed.currency,
        priceDate: '2026-10-09',
        source: seed.provider,
        stale: false
    }));
}

function titlesOf(): SourceTitle[] {
    return TITLE_SEEDS.map((seed: TitleSeed): SourceTitle => ({
        id: `title-${seed.name}`,
        name: seed.name,
        indexDataMissing: false,
        valueMinor: seed.valueMinor,
        currency: seed.currency,
        estimated: false,
        matured: false,
        source: seed.source,
        asOf: '2026-10-11'
    }));
}

function assignmentsOf(): SourceAssignment[] {
    const positions: SourceAssignment[] = POSITION_SEEDS.map((seed: PositionSeed): SourceAssignment => ({
        subjectType: 'position',
        subjectId: `position-${seed.symbol}`,
        classId: classIdOf(seed.classKey),
        targetInClassBps: 0
    }));
    const titles: SourceAssignment[] = TITLE_SEEDS.map((seed: TitleSeed): SourceAssignment => ({
        subjectType: 'fixed_income',
        subjectId: `title-${seed.name}`,
        classId: classIdOf(seed.classKey),
        targetInClassBps: 0
    }));
    return [...positions, ...titles];
}

export function makePrototypeSource(overrides: PrototypeOverrides = {}): PortfolioSourceData {
    return {
        asOf: '2026-10-11',
        baseCurrency: overrides.baseCurrency ?? 'BRL',
        toleranceBps: overrides.toleranceBps ?? 500,
        positions: positionsOf(),
        assets: assetsOf(),
        quotes: quotesOf(overrides.withoutQuotes ?? []),
        titles: titlesOf(),
        classes: makeSourceClasses(),
        assignments: assignmentsOf(),
        usdRate: overrides.usdRate === undefined ? PTAX_RATE : overrides.usdRate
    };
}
