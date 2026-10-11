import type { Decimal } from '../../../../shared/utils/decimal.util';

export const INDEXERS = {
    cdiPercent: 'cdi_percent',
    prefixed: 'prefixed',
    ipcaPlus: 'ipca_plus'
} as const;

export type Indexer = (typeof INDEXERS)[keyof typeof INDEXERS];

export const CURRENCIES = {
    brl: 'BRL',
    usd: 'USD'
} as const;

export type Currency = (typeof CURRENCIES)[keyof typeof CURRENCIES];

export const TAX_REGIMES = {
    regressive: 'regressive',
    exempt: 'exempt'
} as const;

export type TaxRegime = (typeof TAX_REGIMES)[keyof typeof TAX_REGIMES];

export const VALUATION_STATUSES = {
    ok: 'ok',
    indexDataMissing: 'index_data_missing'
} as const;

export type ValuationStatus = (typeof VALUATION_STATUSES)[keyof typeof VALUATION_STATUSES];

export const VALUATION_SOURCES = {
    cdi: 'curve_cdi',
    pre: 'curve_pre',
    ipca: 'curve_ipca'
} as const;

export type ValuationSource = (typeof VALUATION_SOURCES)[keyof typeof VALUATION_SOURCES];

export interface CurveTerms {
    readonly indexer: Indexer;
    readonly rateBps: number;
    readonly currency: Currency;
    readonly appliedMinor: number;
    readonly appliedAt: string;
    readonly maturityDate: string;
    readonly taxRegime: TaxRegime;
}

export interface SeriesPoint {
    readonly date: string;
    readonly value: string;
}

export interface CdiCurve {
    readonly dates: readonly string[];
    readonly rates: readonly Decimal[];
}

export interface IpcaSeries {
    readonly months: readonly string[];
    readonly values: readonly Decimal[];
}

export interface CurveSeries {
    readonly cdi: CdiCurve;
    readonly ipca: IpcaSeries;
}

export interface AccrualDay {
    readonly date: string;
    readonly rate: Decimal;
    readonly projected: boolean;
}

export interface FixedIncomeValuation {
    readonly asOf: string;
    readonly valueMinor: number;
    readonly currency: Currency;
    readonly accruedBps: number;
    readonly matured: boolean;
    readonly estimated: boolean;
    readonly status: ValuationStatus;
    readonly source: ValuationSource;
    readonly taxRegime: TaxRegime;
    readonly taxEstimatedMinor: number;
    readonly netEstimatedMinor: number;
}
