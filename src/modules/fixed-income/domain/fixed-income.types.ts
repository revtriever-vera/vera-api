import { Insertable, Selectable } from 'kysely';
import { FixedIncomeTitles, IndexSeriesPoints } from '../../../core/database/generated/database.types';
import { Currency, FixedIncomeValuation, Indexer, TAX_REGIMES, TaxRegime } from './curve/curve.types';

export type FixedIncomeTitleRow = Selectable<FixedIncomeTitles>;
export type NewFixedIncomeTitle = Insertable<FixedIncomeTitles>;
export type IndexSeriesPointRow = Selectable<IndexSeriesPoints>;
export type NewIndexSeriesPoint = Insertable<IndexSeriesPoints>;

export const TITLE_KINDS = {
    cdb: 'cdb',
    lci: 'lci',
    lca: 'lca',
    lc: 'lc',
    debenture: 'debenture',
    cri: 'cri',
    cra: 'cra'
} as const;

export type TitleKind = (typeof TITLE_KINDS)[keyof typeof TITLE_KINDS];

export const TAX_REGIME_BY_KIND: Readonly<Record<TitleKind, TaxRegime>> = {
    cdb: TAX_REGIMES.regressive,
    lci: TAX_REGIMES.exempt,
    lca: TAX_REGIMES.exempt,
    lc: TAX_REGIMES.regressive,
    debenture: TAX_REGIMES.regressive,
    cri: TAX_REGIMES.regressive,
    cra: TAX_REGIMES.regressive
};

export const SUGGESTED_CLASS_KEY_BY_INDEXER: Readonly<Record<Indexer, string>> = {
    cdi_percent: 'rf_pos',
    prefixed: 'rf_pre',
    ipca_plus: 'rf_ipca'
};

export const MAX_TITLES_PER_COMPANY: number = 200;
export const TITLE_NAME_MIN_LENGTH: number = 1;
export const TITLE_NAME_MAX_LENGTH: number = 80;
export const MIN_APPLIED_DATE: string = '2010-01-01';
export const MAX_TERM_YEARS: number = 50;
export const PREVIEW_LIMIT_PER_MINUTE: number = 120;
export const PREVIEW_WINDOW_SECONDS: number = 60;

export interface RateRange {
    readonly min: number;
    readonly max: number;
}

export const RATE_RANGE_BPS: Readonly<Record<Indexer, RateRange>> = {
    cdi_percent: { min: 1, max: 30000 },
    prefixed: { min: 0, max: 10000 },
    ipca_plus: { min: 0, max: 5000 }
};

export const TITLE_ACTIONS = {
    created: 'created',
    updated: 'updated',
    deleted: 'deleted'
} as const;

export type TitleAction = (typeof TITLE_ACTIONS)[keyof typeof TITLE_ACTIONS];

export interface TitleTerms {
    readonly kind: TitleKind;
    readonly indexer: Indexer;
    readonly rateBps: number;
    readonly currency: Currency;
    readonly appliedMinor: number;
    readonly appliedAt: string;
    readonly maturityDate: string;
}

export interface FixedIncomeTitle extends TitleTerms {
    readonly id: string;
    readonly name: string;
    readonly taxRegime: TaxRegime;
    readonly isSample: boolean;
    readonly createdAt: Date;
    readonly updatedAt: Date;
}

export interface ValuedTitle {
    readonly title: FixedIncomeTitle;
    readonly valuation: FixedIncomeValuation;
}

export interface FixedIncomeTitleView {
    readonly id: string;
    readonly kind: TitleKind;
    readonly name: string;
    readonly indexer: Indexer;
    readonly rateBps: number;
    readonly currency: Currency;
    readonly appliedMinor: number;
    readonly appliedAt: string;
    readonly maturityDate: string;
    readonly classId: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly valuation: FixedIncomeValuation;
}
