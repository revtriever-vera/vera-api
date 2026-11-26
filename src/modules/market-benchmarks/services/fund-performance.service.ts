import { Injectable } from '@nestjs/common';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { FundHistory, FundQuoteHistoryService } from '../../market-data/services/fund-quote-history.service';
import {
    FUND_SOURCE,
    FUND_STATES,
    FUND_WINDOWS,
    FundPerformance,
    FundState,
    FundWindow,
    FundWindowReading
} from '../domain/fund-performance.types';
import { BENCHMARK_SOURCES, WindowedReading } from '../domain/benchmark.types';
import { isDailyStale } from '../domain/benchmark-windows';
import { FUND_STALE_DAYS, FundWindowBps, QuotaPoint, fundHistoryStart, fundWindows, lastQuotaOf } from '../domain/fund-windows';
import { BenchmarkService } from './benchmark.service';

export { FUND_WINDOWS, FUND_STATES, FUND_SOURCE };
export type { FundWindow, FundPerformance, FundState, FundWindowReading };

export interface FundPerformanceQuery {
    readonly fundKey: string;
    readonly windows?: readonly FundWindow[];
    readonly asOf: string;
}

function emptyOf(state: FundState, name: string): FundPerformance {
    return {
        state,
        name,
        lastDate: null,
        stale: true,
        complete: true,
        cdiLastDate: null,
        cdiSource: BENCHMARK_SOURCES.cdi,
        source: FUND_SOURCE,
        windows: {},
        missing: []
    };
}

interface WindowReadings {
    readonly windows: Partial<Record<FundWindow, FundWindowReading>>;
    readonly missing: readonly FundWindow[];
}

function readingOf(fundBps: number, cdiBps: number | null): FundWindowReading {
    return { fundBps, cdiBps, differenceBps: cdiBps === null ? null : fundBps - cdiBps };
}

function readingsOf(bps: FundWindowBps, cdi: WindowedReading, shown: readonly FundWindow[]): WindowReadings {
    const windows: Partial<Record<FundWindow, FundWindowReading>> = {};
    const missing: FundWindow[] = [];
    for (const key of shown) {
        const fundBps: number | null = bps[key];
        if (fundBps === null) {
            missing.push(key);
            continue;
        }
        windows[key] = readingOf(fundBps, cdi.windows[key]);
    }
    return { windows, missing };
}

@Injectable()
export class FundPerformanceService {
    public constructor(
        private readonly catalog: AssetCatalogService,
        private readonly history: FundQuoteHistoryService,
        private readonly benchmarks: BenchmarkService
    ) {}

    public async performance(query: FundPerformanceQuery): Promise<FundPerformance> {
        const asset: Asset | null = await this.catalog.findByMarketAndExternalId('CVM', query.fundKey);
        if (asset === null) {
            return emptyOf(FUND_STATES.notFound, '');
        }
        const shown: readonly FundWindow[] = query.windows ?? FUND_WINDOWS;
        const found: FundHistory = await this.history.history(
            { assetId: asset.id, seriesKey: asset.externalId },
            fundHistoryStart(query.asOf, shown),
            query.asOf
        );
        const last: QuotaPoint | undefined = lastQuotaOf(found.points, query.asOf);
        if (last === undefined) {
            return { ...emptyOf(FUND_STATES.noData, asset.name), complete: found.complete, missing: shown };
        }
        return this.readingOf(asset, found, last.date, shown, query.asOf);
    }

    private async readingOf(
        asset: Asset,
        found: FundHistory,
        lastDate: string,
        shown: readonly FundWindow[],
        asOf: string
    ): Promise<FundPerformance> {
        const cdi: WindowedReading = (await this.benchmarks.windows({ asOf: lastDate })).cdi;
        const readings: WindowReadings = readingsOf(fundWindows(found.points, asOf, shown), cdi, shown);
        return {
            state: FUND_STATES.ok,
            name: asset.name,
            lastDate,
            stale: isDailyStale(lastDate, asOf, FUND_STALE_DAYS),
            complete: found.complete,
            cdiLastDate: cdi.lastDate,
            cdiSource: cdi.source,
            source: FUND_SOURCE,
            windows: readings.windows,
            missing: readings.missing
        };
    }
}
