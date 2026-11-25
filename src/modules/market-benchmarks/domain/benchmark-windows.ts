import { Decimal, DecimalUtil } from '../../../shared/utils/decimal.util';
import { addDays, addMonths, daysBetween, monthIndexOf, yearEndBefore } from './benchmark-dates';
import { BENCHMARK_WINDOWS, BENCHMARK_WINDOW_MONTHS, BenchmarkWindow, SeriesPointInput, WindowBps } from './benchmark.types';

const PERCENT: number = 100;
const BPS_PER_UNIT: number = 10000;
const START_TOLERANCE_DAYS: number = 7;
const LOAD_MARGIN_DAYS: number = 20;

export const CDI_STALE_DAYS: number = 5;
export const SELIC_STALE_DAYS: number = 10;
export const IBOVESPA_STALE_DAYS: number = 5;
export const IPCA_STALE_MONTHS: number = 2;

type CloseInput = { readonly date: string; readonly close: string };

function bpsOf(fraction: Decimal): number {
    return DecimalUtil.roundHalfUpToInteger(fraction.times(BPS_PER_UNIT));
}

function emptyWindows(): Record<BenchmarkWindow, number | null> {
    return { m1: null, m3: null, m6: null, m12: null, m24: null, m36: null, ytd: null };
}

function windowStart(key: BenchmarkWindow, lastDate: string): string {
    return key === 'ytd' ? yearEndBefore(lastDate) : addMonths(lastDate, -BENCHMARK_WINDOW_MONTHS[key]);
}

function sortedUpTo<T extends { readonly date: string }>(points: readonly T[], asOf: string): T[] {
    return points
        .filter((point: T): boolean => point.date <= asOf)
        .sort((left: T, right: T): number => left.date.localeCompare(right.date));
}

export function lastDateOf(points: readonly { readonly date: string }[], asOf: string): string | null {
    return sortedUpTo(points, asOf).at(-1)?.date ?? null;
}

function growthOf(point: SeriesPointInput): Decimal {
    return DecimalUtil.of(1).plus(DecimalUtil.of(point.value).div(PERCENT));
}

function growthByWindow(ordered: readonly SeriesPointInput[], starts: readonly string[]): Decimal[] {
    const factors: Decimal[] = starts.map((): Decimal => DecimalUtil.of(1));
    for (const point of ordered) {
        const growth: Decimal = growthOf(point);
        starts.forEach((start: string, index: number): void => {
            factors[index] = point.date > start ? (factors[index] as Decimal).times(growth) : (factors[index] as Decimal);
        });
    }
    return factors;
}

export function cdiWindows(points: readonly SeriesPointInput[], asOf: string): WindowBps {
    const ordered: SeriesPointInput[] = sortedUpTo(points, asOf);
    const first: string | undefined = ordered[0]?.date;
    const last: string | undefined = ordered.at(-1)?.date;
    const result: Record<BenchmarkWindow, number | null> = emptyWindows();
    if (first === undefined || last === undefined) {
        return result;
    }
    const starts: string[] = BENCHMARK_WINDOWS.map((key: BenchmarkWindow): string => windowStart(key, last));
    const factors: Decimal[] = growthByWindow(ordered, starts);
    BENCHMARK_WINDOWS.forEach((key: BenchmarkWindow, index: number): void => {
        const covered: boolean = first <= addDays(starts[index] as string, START_TOLERANCE_DAYS);
        result[key] = covered ? bpsOf((factors[index] as Decimal).minus(1)) : null;
    });
    return result;
}

function monthKeyOf(point: SeriesPointInput): string {
    return point.date.slice(0, 7);
}

function consecutiveMonths(months: readonly string[]): boolean {
    return months.every(
        (month: string, index: number): boolean => index === 0 || monthIndexOf(month) - monthIndexOf(months[index - 1] as string) === 1
    );
}

function ipcaMonthCount(key: BenchmarkWindow, lastMonth: string): number {
    return key === 'ytd' ? Number(lastMonth.slice(5, 7)) : BENCHMARK_WINDOW_MONTHS[key];
}

export function ipcaWindows(points: readonly SeriesPointInput[], asOf: string): WindowBps {
    const ordered: SeriesPointInput[] = sortedUpTo(points, asOf);
    const lastMonth: string | undefined = ordered.length === 0 ? undefined : monthKeyOf(ordered.at(-1) as SeriesPointInput);
    const result: Record<BenchmarkWindow, number | null> = emptyWindows();
    if (lastMonth === undefined) {
        return result;
    }
    for (const key of BENCHMARK_WINDOWS) {
        const count: number = ipcaMonthCount(key, lastMonth);
        const slice: SeriesPointInput[] = ordered.slice(-count);
        if (slice.length < count || !consecutiveMonths(slice.map(monthKeyOf))) {
            continue;
        }
        const factor: Decimal = slice.reduce(
            (accumulated: Decimal, point: SeriesPointInput): Decimal => accumulated.times(growthOf(point)),
            DecimalUtil.of(1)
        );
        result[key] = bpsOf(factor.minus(1));
    }
    return result;
}

function baseCloseOf(ordered: readonly CloseInput[], start: string): CloseInput | undefined {
    return ordered.findLast((point: CloseInput): boolean => point.date <= start);
}

export function closeWindows(points: readonly CloseInput[], asOf: string): WindowBps {
    const ordered: CloseInput[] = sortedUpTo(points, asOf);
    const latest: CloseInput | undefined = ordered.at(-1);
    const result: Record<BenchmarkWindow, number | null> = emptyWindows();
    if (latest === undefined) {
        return result;
    }
    for (const key of BENCHMARK_WINDOWS) {
        const base: CloseInput | undefined = baseCloseOf(ordered, windowStart(key, latest.date));
        if (base === undefined) {
            continue;
        }
        result[key] = bpsOf(DecimalUtil.of(latest.close).div(DecimalUtil.of(base.close)).minus(1));
    }
    return result;
}

export function selicTargetBps(points: readonly SeriesPointInput[], asOf: string): number | null {
    const latest: SeriesPointInput | undefined = sortedUpTo(points, asOf).at(-1);
    return latest === undefined ? null : DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(latest.value).times(PERCENT));
}

export function isDailyStale(lastDate: string | null, asOf: string, limitDays: number): boolean {
    return lastDate === null || daysBetween(lastDate, asOf) > limitDays;
}

export function isMonthlyStale(lastDate: string | null, asOf: string): boolean {
    return lastDate === null || monthIndexOf(asOf.slice(0, 7)) - monthIndexOf(lastDate.slice(0, 7)) > IPCA_STALE_MONTHS;
}

export function historyStart(asOf: string, months: number): string {
    return addDays(addMonths(asOf, -months), -LOAD_MARGIN_DAYS);
}
