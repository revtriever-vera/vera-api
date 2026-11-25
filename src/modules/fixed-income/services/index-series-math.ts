import { Decimal, DecimalUtil } from '../../../shared/utils/decimal.util';
import { accrualDays, addDays, daysBetween, isWeekday } from '../domain/curve/business-days';
import { cdiPercentFactor } from '../domain/curve/cdi-factor';
import type { AccrualDay, CdiCurve, CurveSeries, IpcaSeries } from '../domain/curve/curve.types';
import { monthStart, nextMonthStart, previousMonthKey } from '../domain/curve/ipca-factor';
import { annualRateFactor, BUSINESS_DAYS_PER_YEAR } from '../domain/curve/prefixed-factor';

const PERCENT: number = 100;
const BPS_PER_UNIT: number = 10000;
const DAYS_PER_WEEK: number = 7;
const WEEKDAYS_PER_WEEK: number = 5;

export type { CurveSeries, IpcaSeries };
export type { Currency, Indexer, TaxRegime } from '../domain/curve/curve.types';

export const IPCA_WINDOW_MONTHS: number = 12;

export interface ReferenceRates {
    readonly cdiAnnual: Decimal | null;
    readonly cdiAnnualBps: number | null;
    readonly cdiDate: string | null;
    readonly ipca12m: Decimal | null;
    readonly ipca12mBps: number | null;
    readonly ipcaMonth: string | null;
}

export interface Inflation {
    readonly factor: Decimal;
    readonly estimated: boolean;
}

function bpsOf(fraction: Decimal): number {
    return DecimalUtil.roundHalfUpToInteger(fraction.times(BPS_PER_UNIT));
}

function hasConsecutiveWindow(ipca: IpcaSeries): boolean {
    const last: string | undefined = ipca.months.at(-1);
    const first: string | undefined = ipca.months.at(-IPCA_WINDOW_MONTHS);
    if (last === undefined || first === undefined) {
        return false;
    }
    let cursor: string = last;
    for (let step: number = 1; step < IPCA_WINDOW_MONTHS; step += 1) {
        cursor = previousMonthKey(cursor);
    }
    return cursor === first;
}

function accumulatedTwelveMonths(ipca: IpcaSeries): Decimal | null {
    if (!hasConsecutiveWindow(ipca)) {
        return null;
    }
    return ipca.values
        .slice(-IPCA_WINDOW_MONTHS)
        .reduce(
            (factor: Decimal, monthly: Decimal): Decimal => factor.times(DecimalUtil.of(1).plus(monthly.div(PERCENT))),
            DecimalUtil.of(1)
        )
        .minus(1);
}

function annualizedDailyCdi(daily: Decimal): Decimal {
    return DecimalUtil.of(1).plus(daily.div(PERCENT)).pow(BUSINESS_DAYS_PER_YEAR).minus(1);
}

export function referenceRatesOf(series: CurveSeries): ReferenceRates {
    const lastDaily: Decimal | undefined = series.cdi.rates.at(-1);
    const cdiAnnual: Decimal | null = lastDaily === undefined ? null : annualizedDailyCdi(lastDaily);
    const ipca12m: Decimal | null = accumulatedTwelveMonths(series.ipca);
    return {
        cdiAnnual,
        cdiAnnualBps: cdiAnnual === null ? null : bpsOf(cdiAnnual),
        cdiDate: series.cdi.dates.at(-1) ?? null,
        ipca12m,
        ipca12mBps: ipca12m === null ? null : bpsOf(ipca12m),
        ipcaMonth: ipca12m === null ? null : (series.ipca.months.at(-1) ?? null)
    };
}

export function calendarDaysBetween(from: string, to: string): number {
    return daysBetween(from, to);
}

export function businessDaysBetween(from: string, to: string): number {
    const total: number = daysBetween(from, to);
    if (total <= 0) {
        return 0;
    }
    const fullWeeks: number = Math.floor(total / DAYS_PER_WEEK);
    const remainder: number = total % DAYS_PER_WEEK;
    let counted: number = fullWeeks * WEEKDAYS_PER_WEEK;
    for (let offset: number = 0; offset < remainder; offset += 1) {
        counted += isWeekday(addDays(from, fullWeeks * DAYS_PER_WEEK + offset)) ? 1 : 0;
    }
    return counted;
}

export function compoundFactor(annual: Decimal, from: string, to: string): Decimal {
    return annualRateFactor(annual.times(BPS_PER_UNIT).toNumber(), businessDaysBetween(from, to));
}

function monthlyByKey(ipca: IpcaSeries): ReadonlyMap<string, Decimal> {
    return new Map<string, Decimal>(
        ipca.months.map((month: string, index: number): [string, Decimal] => [month, ipca.values[index] as Decimal])
    );
}

function monthFraction(from: string, cursor: string, next: string): Decimal {
    if (cursor !== monthStart(from)) {
        return DecimalUtil.of(1);
    }
    return DecimalUtil.of(daysBetween(from, next)).div(daysBetween(cursor, next));
}

export function accumulatedInflation(ipca: IpcaSeries, from: string, lastMonth: string): Inflation {
    const byMonth: ReadonlyMap<string, Decimal> = monthlyByKey(ipca);
    let factor: Decimal = DecimalUtil.of(1);
    let estimated: boolean = false;
    let cursor: string = monthStart(from);
    while (cursor.slice(0, 7) <= lastMonth) {
        const next: string = nextMonthStart(cursor);
        const monthly: Decimal | undefined = byMonth.get(cursor.slice(0, 7));
        estimated = estimated || monthly === undefined;
        factor =
            monthly === undefined
                ? factor
                : factor.times(
                      DecimalUtil.of(1)
                          .plus(monthly.div(PERCENT))
                          .pow(monthFraction(from, cursor, next))
                  );
        cursor = next;
    }
    return { factor, estimated };
}

export type Accrual = Inflation;

export function cdiAccrual(cdi: CdiCurve, from: string, to: string, percentBps: number): Accrual | null {
    const days: AccrualDay[] | null = accrualDays(cdi, from, to);
    if (days === null) {
        return null;
    }
    return { factor: cdiPercentFactor(days, percentBps), estimated: days.some((day: AccrualDay): boolean => day.projected) };
}
