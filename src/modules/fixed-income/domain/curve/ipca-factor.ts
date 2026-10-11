import { Decimal, DecimalUtil } from '../../../../shared/utils/decimal.util';
import { daysBetween, lowerBound, utcMonthStart } from './business-days';
import { IpcaSeries, SeriesPoint } from './curve.types';

const PERCENT: number = 100;

export interface IpcaAccrual {
    readonly factor: Decimal;
    readonly estimated: boolean;
}

interface MonthLookup {
    readonly value: Decimal;
    readonly exact: boolean;
}

export function buildIpcaSeries(points: readonly SeriesPoint[]): IpcaSeries {
    const ordered: SeriesPoint[] = [...points].sort((left: SeriesPoint, right: SeriesPoint) => left.date.localeCompare(right.date));
    return {
        months: ordered.map((point: SeriesPoint) => point.date.slice(0, 7)),
        values: ordered.map((point: SeriesPoint) => DecimalUtil.of(point.value))
    };
}

export function monthStart(date: string): string {
    return `${date.slice(0, 7)}-01`;
}

export function nextMonthStart(date: string): string {
    const [year, month]: number[] = date.slice(0, 7).split('-').map(Number) as [number, number];
    return utcMonthStart(year, month);
}

export function previousMonthKey(monthKey: string): string {
    const [year, month]: number[] = monthKey.split('-').map(Number) as [number, number];
    return utcMonthStart(year, month - 2).slice(0, 7);
}

function lookup(series: IpcaSeries, monthKey: string): MonthLookup | null {
    const index: number = lowerBound(series.months, monthKey);
    if (series.months[index] === monthKey) {
        return { value: series.values[index] as Decimal, exact: true };
    }
    if (index === 0) {
        return null;
    }
    return { value: series.values[index - 1] as Decimal, exact: false };
}

function monthSlices(from: string, to: string): Array<{ readonly monthKey: string; readonly fraction: Decimal }> {
    const slices: Array<{ readonly monthKey: string; readonly fraction: Decimal }> = [];
    let cursor: string = monthStart(from);
    while (cursor < to) {
        const next: string = nextMonthStart(cursor);
        const overlap: number = daysBetween(from > cursor ? from : cursor, to < next ? to : next);
        slices.push({ monthKey: cursor.slice(0, 7), fraction: DecimalUtil.of(overlap).div(daysBetween(cursor, next)) });
        cursor = next;
    }
    return slices;
}

export function ipcaFactor(series: IpcaSeries, from: string, to: string): IpcaAccrual | null {
    let factor: Decimal = DecimalUtil.of(1);
    let estimated: boolean = false;
    if (from >= to) {
        return { factor, estimated };
    }
    for (const slice of monthSlices(from, to)) {
        const found: MonthLookup | null = lookup(series, previousMonthKey(slice.monthKey));
        if (found === null) {
            return null;
        }
        factor = factor.times(DecimalUtil.of(1).plus(found.value.div(PERCENT)).pow(slice.fraction));
        estimated = estimated || !found.exact;
    }
    return { factor, estimated };
}
