import type { CurveSeries, Currency, Indexer, TaxRegime } from '../../fixed-income/services/index-series-math';

export const HOLDING_KINDS = {
    fixedIncome: 'fixed_income',
    position: 'position'
} as const;

export type HoldingKind = (typeof HOLDING_KINDS)[keyof typeof HOLDING_KINDS];

export const PROJECTION_BASES = {
    contract: 'contract',
    cdiProjection: 'cdi_projection',
    ipcaProjection: 'ipca_projection',
    inflationOnly: 'inflation_only',
    faceValue: 'face_value'
} as const;

export type ProjectionBasis = (typeof PROJECTION_BASES)[keyof typeof PROJECTION_BASES];

export const TREASURY_KINDS = {
    selic: 'selic',
    prefixed: 'prefixado',
    ipca: 'ipca'
} as const;

export type TreasuryKind = (typeof TREASURY_KINDS)[keyof typeof TREASURY_KINDS];

export const REQUEST_RESULTS = {
    ok: 'ok',
    indexDataMissing: 'index_data_missing'
} as const;

export type RequestResult = (typeof REQUEST_RESULTS)[keyof typeof REQUEST_RESULTS];

export const SOON_DAYS: number = 90;
export const LOW_REAL_RATE_BPS: number = 300;
export const REALLOCATE_STEP_MINOR: number = 10_000;
export const TREASURY_FACE_VALUE: string = '1000';
export const MATURITIES_DEFAULT_LIMIT: number = 50;
export const MATURITIES_MAX_LIMIT: number = 500;

export interface ScheduleTitle {
    readonly id: string;
    readonly name: string;
    readonly kind: string;
    readonly indexer: Indexer;
    readonly rateBps: number;
    readonly currency: Currency;
    readonly appliedMinor: number;
    readonly appliedAt: string;
    readonly maturityDate: string;
    readonly taxRegime: TaxRegime;
    readonly issuerName: string | null;
    readonly valueMinor: number;
    readonly valuationEstimated: boolean;
    readonly indexDataMissing: boolean;
    readonly matured: boolean;
    readonly isSample: boolean;
}

export interface ScheduleTreasury {
    readonly id: string;
    readonly name: string;
    readonly kind: TreasuryKind;
    readonly quantity: string;
    readonly maturityDate: string;
    readonly valueTodayMinor: number | null;
    readonly isSample: boolean;
    readonly holderUserId: string | null;
}

export interface ScheduleInputs {
    readonly today: string;
    readonly series: CurveSeries;
    readonly usdRate: string | null;
    readonly titles: readonly ScheduleTitle[];
    readonly treasuries: readonly ScheduleTreasury[];
}

export interface Projection {
    readonly valueMinor: number;
    readonly estimated: boolean;
    readonly basis: ProjectionBasis;
}

export interface MaturityItem {
    readonly holdingKind: HoldingKind;
    readonly id: string;
    readonly name: string;
    readonly issuerName: string | null;
    readonly kind: string | null;
    readonly maturityDate: string;
    readonly daysToMaturity: number;
    readonly soon: boolean;
    readonly estimatedValueMinor: number;
    readonly currency: 'BRL';
    readonly reallocateMinor: number;
    readonly estimated: boolean;
    readonly basis: ProjectionBasis;
    readonly taxRegime: TaxRegime | null;
    readonly isSample: boolean;
}

export interface RealRateItem {
    readonly id: string;
    readonly name: string;
    readonly kind: string;
    readonly indexer: Indexer;
    readonly rateBps: number;
    readonly appliedMinor: number;
    readonly appliedAt: string;
    readonly valueMinor: number;
    readonly nominalAnnualBps: number | null;
    readonly realAnnualBps: number | null;
    readonly lowReal: boolean;
    readonly correctedMinor: number;
    readonly purchasingPowerGainMinor: number;
    readonly purchasingPowerGainBps: number;
    readonly taxRegime: TaxRegime;
    readonly estimated: boolean;
}
