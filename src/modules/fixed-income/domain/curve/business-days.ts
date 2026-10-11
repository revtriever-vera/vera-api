import { DecimalUtil } from '../../../../shared/utils/decimal.util';
import { AccrualDay, CdiCurve, SeriesPoint } from './curve.types';

const DAY_MS: number = 86_400_000;
export const MAX_LEADING_GAP_DAYS: number = 7;
export const MAX_PROJECTION_DAYS: number = 10;
const SATURDAY: number = 6;
const SUNDAY: number = 0;

export function toEpochDay(date: string): number {
    return Date.parse(`${date}T00:00:00Z`) / DAY_MS;
}

export function fromEpochDay(epochDay: number): string {
    return new Date(epochDay * DAY_MS).toISOString().slice(0, 10);
}

export function utcMonthStart(year: number, monthIndex: number): string {
    return fromEpochDay(Date.UTC(year, monthIndex, 1) / DAY_MS);
}

export function addDays(date: string, days: number): string {
    return fromEpochDay(toEpochDay(date) + days);
}

export function daysBetween(from: string, to: string): number {
    return toEpochDay(to) - toEpochDay(from);
}

export function isWeekday(date: string): boolean {
    const weekday: number = new Date(`${date}T00:00:00Z`).getUTCDay();
    return weekday !== SATURDAY && weekday !== SUNDAY;
}

export function buildCdiCurve(points: readonly SeriesPoint[]): CdiCurve {
    const ordered: SeriesPoint[] = [...points].sort((left: SeriesPoint, right: SeriesPoint) => left.date.localeCompare(right.date));
    return {
        dates: ordered.map((point: SeriesPoint) => point.date),
        rates: ordered.map((point: SeriesPoint) => DecimalUtil.of(point.value))
    };
}

export function lowerBound(dates: readonly string[], target: string): number {
    let low: number = 0;
    let high: number = dates.length;
    while (low < high) {
        const middle: number = (low + high) >> 1;
        const goesRight: boolean = (dates[middle] as string) < target;
        low = goesRight ? middle + 1 : low;
        high = goesRight ? high : middle;
    }
    return low;
}

function covers(curve: CdiCurve, from: string, to: string): boolean {
    const first: string | undefined = curve.dates[0];
    const last: string | undefined = curve.dates.at(-1);
    if (first === undefined || last === undefined) {
        return false;
    }
    if (daysBetween(from, first) > MAX_LEADING_GAP_DAYS) {
        return false;
    }
    return daysBetween(last, addDays(to, -1)) <= MAX_PROJECTION_DAYS;
}

function publishedDays(curve: CdiCurve, from: string, to: string): AccrualDay[] {
    const start: number = lowerBound(curve.dates, from);
    const end: number = lowerBound(curve.dates, to);
    return curve.dates.slice(start, end).map((date: string, offset: number): AccrualDay => ({
        date,
        rate: curve.rates[start + offset] as AccrualDay['rate'],
        projected: false
    }));
}

function projectedDays(curve: CdiCurve, from: string, to: string): AccrualDay[] {
    const lastDate: string = curve.dates.at(-1) as string;
    const lastRate: AccrualDay['rate'] = curve.rates.at(-1) as AccrualDay['rate'];
    const start: number = Math.max(toEpochDay(from), toEpochDay(lastDate) + 1);
    const days: AccrualDay[] = [];
    for (let epochDay: number = start; epochDay < toEpochDay(to); epochDay += 1) {
        const date: string = fromEpochDay(epochDay);
        if (isWeekday(date)) {
            days.push({ date, rate: lastRate, projected: true });
        }
    }
    return days;
}

export function accrualDays(curve: CdiCurve, from: string, to: string): AccrualDay[] | null {
    if (from >= to) {
        return [];
    }
    if (!covers(curve, from, to)) {
        return null;
    }
    return [...publishedDays(curve, from, to), ...projectedDays(curve, from, to)];
}
