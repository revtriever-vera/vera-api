export const FIXED_INCOME_STATES = { ok: 'ok', list: 'list', notFound: 'not_found', noTitles: 'no_titles', noIndex: 'no_index' } as const;

export type FixedIncomeState = (typeof FIXED_INCOME_STATES)[keyof typeof FIXED_INCOME_STATES];

export const MAX_LISTED_TITLES: number = 20;
export const TITLE_KEY_PREFIX: string = 'rf';

export interface FixedIncomeReference {
    readonly cdi12Bps: number | null;
    readonly cdiLastDate: string | null;
    readonly cdiSource: string;
    readonly ipca12Bps: number | null;
    readonly ipcaLastDate: string | null;
    readonly ipcaSource: string;
}

export interface FixedIncomeTitleFigures {
    readonly key: string;
    readonly kind: string;
    readonly indexer: string;
    readonly rateBps: number;
    readonly appliedAt: string;
    readonly nominalAnnualBps: number | null;
    readonly realAnnualBps: number | null;
    readonly beatsInflation: boolean | null;
    readonly versusCdiBps: number | null;
    readonly estimated: boolean;
}

export interface FixedIncomeComparison {
    readonly state: FixedIncomeState;
    readonly reference: FixedIncomeReference;
    readonly titles: readonly FixedIncomeTitleFigures[];
}
