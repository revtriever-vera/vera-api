import { Injectable } from '@nestjs/common';
import { IndexSeriesReaderService, SeriesPoint } from '../../fixed-income/services/index-series-reader.service';
import { MarketIndexClose, MarketIndexReaderService, MarketIndexReading } from '../../market-data/services/market-index-reader.service';
import {
    BENCHMARK_SOURCES,
    BenchmarkWindows,
    IBOVESPA_STATES,
    IbovespaReading,
    MAX_WINDOW_MONTHS,
    SelicTargetReading,
    WindowedReading
} from '../domain/benchmark.types';
import {
    CDI_STALE_DAYS,
    IBOVESPA_STALE_DAYS,
    SELIC_STALE_DAYS,
    cdiWindows,
    closeWindows,
    historyStart,
    ipcaWindows,
    isDailyStale,
    isMonthlyStale,
    lastDateOf,
    selicTargetBps
} from '../domain/benchmark-windows';

export { BENCHMARK_WINDOWS, BENCHMARK_WINDOW_MONTHS, IBOVESPA_STATES } from '../domain/benchmark.types';
export type { BenchmarkWindow, BenchmarkWindows, IbovespaState, SelicTargetReading, WindowedReading } from '../domain/benchmark.types';

const SELIC_LOOKBACK_MONTHS: number = 2;

export interface BenchmarkQuery {
    readonly asOf: string;
}

@Injectable()
export class BenchmarkService {
    public constructor(
        private readonly series: IndexSeriesReaderService,
        private readonly market: MarketIndexReaderService
    ) {}

    public async windows(query: BenchmarkQuery): Promise<BenchmarkWindows> {
        const from: string = historyStart(query.asOf, MAX_WINDOW_MONTHS);
        const [cdi, ipca, selic, ibovespa]: [SeriesPoint[], SeriesPoint[], SeriesPoint[], MarketIndexReading] = await Promise.all([
            this.series.loadCdiSince(from),
            this.series.loadIpcaSince(from),
            this.series.loadSelicTargetSince(historyStart(query.asOf, SELIC_LOOKBACK_MONTHS)),
            this.market.ibovespaSince(from)
        ]);
        return {
            asOf: query.asOf,
            cdi: this.cdiOf(cdi, query.asOf),
            ipca: this.ipcaOf(ipca, query.asOf),
            selicTarget: this.selicOf(selic, query.asOf),
            ibovespa: this.ibovespaOf(ibovespa, query.asOf)
        };
    }

    private cdiOf(points: readonly SeriesPoint[], asOf: string): WindowedReading {
        const lastDate: string | null = lastDateOf(points, asOf);
        return {
            source: BENCHMARK_SOURCES.cdi,
            lastDate,
            stale: isDailyStale(lastDate, asOf, CDI_STALE_DAYS),
            windows: cdiWindows(points, asOf)
        };
    }

    private ipcaOf(points: readonly SeriesPoint[], asOf: string): WindowedReading {
        const lastDate: string | null = lastDateOf(points, asOf);
        return {
            source: BENCHMARK_SOURCES.ipca,
            lastDate,
            stale: isMonthlyStale(lastDate, asOf),
            windows: ipcaWindows(points, asOf)
        };
    }

    private selicOf(points: readonly SeriesPoint[], asOf: string): SelicTargetReading {
        const lastDate: string | null = lastDateOf(points, asOf);
        return {
            source: BENCHMARK_SOURCES.selicTarget,
            lastDate,
            stale: isDailyStale(lastDate, asOf, SELIC_STALE_DAYS),
            bps: selicTargetBps(points, asOf)
        };
    }

    private ibovespaOf(reading: MarketIndexReading, asOf: string): IbovespaReading {
        const closes: readonly MarketIndexClose[] = reading.points;
        const lastDate: string | null = lastDateOf(closes, asOf);
        const state: IbovespaReading['state'] =
            lastDate === null && reading.state === IBOVESPA_STATES.ok ? IBOVESPA_STATES.noData : reading.state;
        return {
            state,
            source: BENCHMARK_SOURCES.ibovespa,
            lastDate,
            stale: isDailyStale(lastDate, asOf, IBOVESPA_STALE_DAYS),
            windows: closeWindows(closes, asOf)
        };
    }
}
