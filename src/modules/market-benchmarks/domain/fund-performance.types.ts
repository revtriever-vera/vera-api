import type { BenchmarkWindow } from './benchmark.types';

export const FUND_WINDOWS = ['m1', 'm3', 'm6', 'm12', 'm36'] as const satisfies readonly BenchmarkWindow[];

export type FundWindow = (typeof FUND_WINDOWS)[number];

export const FUND_SOURCE: string = 'CVM, informe diário';

export const FUND_STATES = { ok: 'ok', notFound: 'not_found', noData: 'no_data' } as const;

export type FundState = (typeof FUND_STATES)[keyof typeof FUND_STATES];

export interface FundWindowReading {
    readonly fundBps: number;
    readonly cdiBps: number | null;
    readonly differenceBps: number | null;
}

export interface FundPerformance {
    readonly state: FundState;
    readonly name: string;
    readonly lastDate: string | null;
    readonly stale: boolean;
    readonly complete: boolean;
    readonly cdiLastDate: string | null;
    readonly cdiSource: string;
    readonly source: string;
    readonly windows: Readonly<Partial<Record<FundWindow, FundWindowReading>>>;
    readonly missing: readonly FundWindow[];
}
