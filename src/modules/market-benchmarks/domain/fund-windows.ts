import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { addDays, addMonths } from './benchmark-dates';
import { BENCHMARK_WINDOW_MONTHS } from './benchmark.types';
import { FundWindow } from './fund-performance.types';

export const FUND_STALE_DAYS: number = 10;
export const FUND_BASE_TOLERANCE_DAYS: number = 10;

const BPS_PER_UNIT: number = 10000;

export interface QuotaPoint {
    readonly date: string;
    readonly quota: string;
}

export type FundWindowBps = Readonly<Record<FundWindow, number | null>>;

function emptyWindows(): Record<FundWindow, number | null> {
    return { m1: null, m3: null, m6: null, m12: null, m36: null };
}

export function fundHistoryStart(asOf: string, windows: readonly FundWindow[]): string {
    const longest: number = Math.max(...windows.map((key: FundWindow): number => BENCHMARK_WINDOW_MONTHS[key]));
    return addDays(addMonths(asOf, -longest), -FUND_BASE_TOLERANCE_DAYS);
}

function baseQuotaOf(ordered: readonly QuotaPoint[], start: string): QuotaPoint | undefined {
    const base: QuotaPoint | undefined = ordered.findLast((point: QuotaPoint): boolean => point.date <= start);
    return base !== undefined && base.date >= addDays(start, -FUND_BASE_TOLERANCE_DAYS) ? base : undefined;
}

export function lastQuotaOf(points: readonly QuotaPoint[], asOf: string): QuotaPoint | undefined {
    return points
        .filter((point: QuotaPoint): boolean => point.date <= asOf)
        .sort(byDate)
        .at(-1);
}

function byDate(left: QuotaPoint, right: QuotaPoint): number {
    return left.date.localeCompare(right.date);
}

export function fundWindows(points: readonly QuotaPoint[], asOf: string, shown: readonly FundWindow[]): FundWindowBps {
    const ordered: QuotaPoint[] = points.filter((point: QuotaPoint): boolean => point.date <= asOf).sort(byDate);
    const latest: QuotaPoint | undefined = ordered.at(-1);
    const result: Record<FundWindow, number | null> = emptyWindows();
    if (latest === undefined) {
        return result;
    }
    for (const key of shown) {
        const base: QuotaPoint | undefined = baseQuotaOf(ordered, addMonths(latest.date, -BENCHMARK_WINDOW_MONTHS[key]));
        if (base === undefined) {
            continue;
        }
        result[key] = DecimalUtil.roundHalfUpToInteger(
            DecimalUtil.of(latest.quota).div(DecimalUtil.of(base.quota)).minus(1).times(BPS_PER_UNIT)
        );
    }
    return result;
}
