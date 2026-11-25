export const BENCHMARK_WINDOWS = ['m1', 'm3', 'm6', 'm12', 'm24', 'm36', 'ytd'] as const;

export type BenchmarkWindow = (typeof BENCHMARK_WINDOWS)[number];

export const BENCHMARK_WINDOW_MONTHS: Readonly<Record<Exclude<BenchmarkWindow, 'ytd'>, number>> = {
    m1: 1,
    m3: 3,
    m6: 6,
    m12: 12,
    m24: 24,
    m36: 36
};

export const MAX_WINDOW_MONTHS: number = 36;

export const BENCHMARK_SOURCES = {
    cdi: 'Banco Central, série 12',
    ipca: 'Banco Central, série 433',
    selicTarget: 'Banco Central, série 432',
    ibovespa: 'brapi'
} as const;

export type WindowBps = Readonly<Record<BenchmarkWindow, number | null>>;

export interface SeriesPointInput {
    readonly date: string;
    readonly value: string;
}

export interface WindowedReading {
    readonly source: string;
    readonly lastDate: string | null;
    readonly stale: boolean;
    readonly windows: WindowBps;
}

export interface SelicTargetReading {
    readonly source: string;
    readonly lastDate: string | null;
    readonly stale: boolean;
    readonly bps: number | null;
}

export const IBOVESPA_STATES = { ok: 'ok', notConfigured: 'not_configured', noData: 'no_data' } as const;

export type IbovespaState = (typeof IBOVESPA_STATES)[keyof typeof IBOVESPA_STATES];

export interface IbovespaReading extends WindowedReading {
    readonly state: IbovespaState;
}

export interface BenchmarkWindows {
    readonly asOf: string;
    readonly cdi: WindowedReading;
    readonly ipca: WindowedReading;
    readonly selicTarget: SelicTargetReading;
    readonly ibovespa: IbovespaReading;
}
