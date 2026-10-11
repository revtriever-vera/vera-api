export const HOLDING_KINDS = {
    position: 'position',
    fixedIncome: 'fixed_income'
} as const;

export type HoldingKind = (typeof HOLDING_KINDS)[keyof typeof HOLDING_KINDS];

export const VALUE_SOURCES = {
    brapi: 'brapi',
    finnhub: 'finnhub',
    twelvedata: 'twelvedata',
    alphavantage: 'alphavantage',
    coingecko: 'coingecko',
    tesouroDireto: 'tesouro_direto',
    curveCdi: 'curve_cdi',
    curvePre: 'curve_pre',
    curveIpca: 'curve_ipca'
} as const;

export type ValueSource = (typeof VALUE_SOURCES)[keyof typeof VALUE_SOURCES];

export const VALUE_SOURCE_BY_PROVIDER: Readonly<Record<string, ValueSource>> = {
    brapi: VALUE_SOURCES.brapi,
    finnhub: VALUE_SOURCES.finnhub,
    twelvedata: VALUE_SOURCES.twelvedata,
    alphavantage: VALUE_SOURCES.alphavantage,
    coingecko: VALUE_SOURCES.coingecko,
    tesouro: VALUE_SOURCES.tesouroDireto,
    tesouro_direto: VALUE_SOURCES.tesouroDireto,
    curve_cdi: VALUE_SOURCES.curveCdi,
    curve_pre: VALUE_SOURCES.curvePre,
    curve_ipca: VALUE_SOURCES.curveIpca
};

export const VALUE_SOURCE_BY_MARKET: Readonly<Record<string, ValueSource>> = {
    B3: VALUE_SOURCES.brapi,
    US: VALUE_SOURCES.finnhub,
    CRYPTO: VALUE_SOURCES.coingecko,
    TESOURO: VALUE_SOURCES.tesouroDireto
};

export const FIXED_INCOME_TYPE_GROUP: string = 'fixed_income';
export const INDEX_DATA_MISSING_STATUS: string = 'index_data_missing';
export const USD_CURRENCY: string = 'USD';
export const BPS_TOTAL: number = 10000;

export const DEVIATION_STATUSES = {
    within: 'within',
    above: 'above',
    below: 'below'
} as const;

export type DeviationStatus = (typeof DEVIATION_STATUSES)[keyof typeof DEVIATION_STATUSES];

export interface SourcePosition {
    readonly id: string;
    readonly assetId: string;
    readonly quantity: string;
}

export interface SourceAsset {
    readonly id: string;
    readonly symbol: string;
    readonly name: string;
    readonly market: string;
    readonly typeGroup: string;
    readonly currency: string;
    readonly quantityDecimals: number;
    readonly dollarExposure: boolean;
}

export interface SourceQuote {
    readonly assetId: string;
    readonly price: string;
    readonly currency: string;
    readonly priceDate: string;
    readonly source: string;
    readonly stale: boolean;
}

export interface SourceTitle {
    readonly id: string;
    readonly name: string;
    readonly indexDataMissing: boolean;
    readonly valueMinor: number;
    readonly currency: string;
    readonly estimated: boolean;
    readonly matured: boolean;
    readonly source: string;
    readonly asOf: string;
}

export interface SourceClass {
    readonly id: string;
    readonly systemKey: string | null;
    readonly name: string | null;
    readonly displayName: string;
    readonly colorKey: string;
    readonly targetBps: number;
    readonly sortOrder: number;
}

export interface SourceAssignment {
    readonly subjectType: string;
    readonly subjectId: string;
    readonly classId: string;
    readonly targetInClassBps: number;
}

export interface SourceRate {
    readonly brlPerUnit: string;
    readonly date: string;
    readonly source: string;
}

export interface PortfolioSourceData {
    readonly asOf: string;
    readonly baseCurrency: string;
    readonly toleranceBps: number;
    readonly positions: readonly SourcePosition[];
    readonly assets: readonly SourceAsset[];
    readonly quotes: readonly SourceQuote[];
    readonly titles: readonly SourceTitle[];
    readonly classes: readonly SourceClass[];
    readonly assignments: readonly SourceAssignment[];
    readonly usdRate: SourceRate | null;
}

export interface Holding {
    readonly kind: HoldingKind;
    readonly id: string;
    readonly assetId: string | null;
    readonly symbol: string;
    readonly name: string;
    readonly market: string | null;
    readonly typeGroup: string;
    readonly classId: string | null;
    readonly quantity: string | null;
    readonly quantityDecimals: number | null;
    readonly unitPrice: string | null;
    readonly priceCurrency: string | null;
    readonly nativeValueMinor: number;
    readonly nativeCurrency: string;
    readonly valueMinor: number;
    readonly valueSource: ValueSource;
    readonly priceDate: string | null;
    readonly dollarExposure: boolean;
    readonly missingQuote: boolean;
    readonly stale: boolean;
    readonly estimated: boolean;
    readonly matured: boolean;
    readonly missingRate: boolean;
    readonly indexDataMissing: boolean;
    readonly isZeroQuantity: boolean;
    readonly storedTargetInClassBps: number;
    readonly effectiveTargetInClassBps: number;
}

export interface ClassSummary {
    readonly classId: string;
    readonly systemKey: string | null;
    readonly name: string | null;
    readonly displayName: string;
    readonly colorKey: string;
    readonly sortOrder: number;
    readonly valueMinor: number;
    readonly shareBps: number;
    readonly targetBps: number;
    readonly deviationBps: number;
    readonly status: DeviationStatus;
    readonly gapMinor: number;
    readonly holdingsCount: number;
}

export interface LargestDeviation {
    readonly classId: string;
    readonly deviationBps: number;
    readonly gapMinor: number;
    readonly status: DeviationStatus;
}

export interface DollarExposure {
    readonly valueMinor: number;
    readonly shareBps: number;
}

export interface PortfolioQuality {
    readonly missingQuotes: number;
    readonly staleQuotes: number;
    readonly estimatedFixedIncome: number;
    readonly indexDataMissing: number;
    readonly missingRates: number;
}

export interface PortfolioRate {
    readonly brlPerUnit: string;
    readonly date: string;
    readonly source: string;
}

export interface PortfolioSnapshot {
    readonly baseCurrency: string;
    readonly asOf: string;
    readonly toleranceBps: number;
    readonly totalMinor: number;
    readonly unclassifiedMinor: number;
    readonly empty: boolean;
    readonly usdRate: PortfolioRate | null;
    readonly dollarExposure: DollarExposure;
    readonly classes: readonly ClassSummary[];
    readonly holdings: readonly Holding[];
    readonly outsideCount: number;
    readonly largestDeviation: LargestDeviation | null;
    readonly quality: PortfolioQuality;
    readonly orphanHoldings: readonly OrphanHolding[];
}

export interface OrphanHolding {
    readonly subjectType: string;
    readonly subjectId: string;
}
