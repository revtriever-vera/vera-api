import { Injectable } from '@nestjs/common';
import { BenchmarkService, BenchmarkWindows } from '../../market-benchmarks/services/benchmark.service';
import { BENCHMARK_STATES, BenchmarkState } from '../domain/monthly-review.types';
import { lastDayOf } from '../domain/review-months';
import { MonthlyReview } from '../validation/monthly-review.schemas';

const BPS_PER_PERCENT: number = 100;

type BenchmarkReading = MonthlyReview['benchmarks']['cdi'];

interface WindowedLike {
    readonly lastDate: string | null;
    readonly stale: boolean;
    readonly windows: { readonly m1: number | null };
}

function readingOf(reading: WindowedLike, state: BenchmarkState): BenchmarkReading {
    const usable: boolean = state === BENCHMARK_STATES.ok && !reading.stale && reading.windows.m1 !== null;
    if (!usable) {
        const unavailable: BenchmarkState = state === BENCHMARK_STATES.ok ? BENCHMARK_STATES.noData : state;
        return { state: unavailable, returnPct: null, referenceMonth: null };
    }
    return {
        state: BENCHMARK_STATES.ok,
        returnPct: (reading.windows.m1 as number) / BPS_PER_PERCENT,
        referenceMonth: reading.lastDate === null ? null : reading.lastDate.slice(0, 7)
    };
}

@Injectable()
export class MonthlyReviewBenchmarksService {
    public constructor(private readonly benchmarks: BenchmarkService) {}

    public async of(month: string): Promise<MonthlyReview['benchmarks']> {
        const windows: BenchmarkWindows = await this.benchmarks.windows({ asOf: lastDayOf(month) });
        return {
            cdi: readingOf(windows.cdi, BENCHMARK_STATES.ok),
            ipca: readingOf(windows.ipca, BENCHMARK_STATES.ok),
            ibovespa: readingOf(windows.ibovespa, windows.ibovespa.state)
        };
    }
}
