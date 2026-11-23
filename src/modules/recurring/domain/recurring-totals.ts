import { monthlyEquivalent } from './recurring-schedule';
import { RecurringSeriesRecord, SERIES_KINDS, SERIES_STATUSES, SeriesKind } from './recurring-series.types';

export interface KindTotals {
    readonly subscription: number;
    readonly bill: number;
    readonly other: number;
}

export interface RecurringTotals {
    readonly monthlyMinor: number;
    readonly yearlyMinor: number;
    readonly byKind: KindTotals;
    readonly suggestions: { readonly count: number; readonly monthlyMinor: number };
}

type Counted = Pick<RecurringSeriesRecord, 'cadence' | 'kind' | 'status' | 'typicalAmountMinor' | 'snoozedUntil'>;

const MONTHS_IN_YEAR: number = 12;

function sumMonthly(series: readonly Counted[]): number {
    return series.reduce((sum: number, item: Counted): number => sum + monthlyEquivalent(item.typicalAmountMinor, item.cadence), 0);
}

function ofKind(series: readonly Counted[], kind: SeriesKind): number {
    return sumMonthly(series.filter((item: Counted): boolean => item.kind === kind));
}

export function isToReview(item: Pick<RecurringSeriesRecord, 'status' | 'snoozedUntil'>, today: string): boolean {
    return item.status === SERIES_STATUSES.suggested && (item.snoozedUntil === null || item.snoozedUntil <= today);
}

export function computeTotals(series: readonly Counted[], today: string): RecurringTotals {
    const confirmed: Counted[] = series.filter((item: Counted): boolean => item.status === SERIES_STATUSES.confirmed);
    const suggested: Counted[] = series.filter((item: Counted): boolean => isToReview(item, today));
    const monthlyMinor: number = sumMonthly(confirmed);
    return {
        monthlyMinor,
        yearlyMinor: monthlyMinor * MONTHS_IN_YEAR,
        byKind: {
            subscription: ofKind(confirmed, SERIES_KINDS.subscription),
            bill: ofKind(confirmed, SERIES_KINDS.bill),
            other: ofKind(confirmed, SERIES_KINDS.other)
        },
        suggestions: { count: suggested.length, monthlyMinor: sumMonthly(suggested) }
    };
}
