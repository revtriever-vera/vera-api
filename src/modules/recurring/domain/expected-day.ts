import { Charge } from './charge';
import { dayOfMonth, daysInMonth, distanceToDay, isLastDayOfMonth, monthOf } from './recurring-dates';
import { median } from './recurring-math';
import { DAY_REANCHOR_GAP, DAY_TOLERANCE, DayChange } from './recurring.types';

export interface ExpectedDay {
    readonly expectedDay: number;
    readonly dayChange: DayChange | null;
}

const DAY_WINDOW: number = 3;
const LAST_DAY_OF_LONGEST_MONTH: number = 31;
const MIN_LAST_DAY: number = 28;

function chargeDay(date: string): number {
    const day: number = dayOfMonth(date);
    return isLastDayOfMonth(date) && day >= MIN_LAST_DAY && daysInMonth(monthOf(date)) < LAST_DAY_OF_LONGEST_MONTH
        ? LAST_DAY_OF_LONGEST_MONTH
        : day;
}

function medianDay(charges: readonly Charge[]): number {
    return median(charges.slice(-DAY_WINDOW).map((charge: Charge): number => chargeDay(charge.transaction.date)));
}

function isOutside(charge: Charge, day: number): boolean {
    return distanceToDay(charge.transaction.date, day) > DAY_TOLERANCE;
}

function movedTogether(left: Charge, right: Charge): boolean {
    return Math.abs(chargeDay(left.transaction.date) - chargeDay(right.transaction.date)) <= DAY_REANCHOR_GAP;
}

export function expectDay(sorted: readonly Charge[]): ExpectedDay {
    const recent: readonly Charge[] = sorted.slice(-2);
    const earlier: readonly Charge[] = sorted.slice(0, -2);
    const first: Charge | undefined = recent[0];
    const second: Charge | undefined = recent[1];
    if (earlier.length === 0 || first === undefined || second === undefined) {
        return { expectedDay: medianDay(sorted), dayChange: null };
    }
    const anchor: number = medianDay(earlier);
    if (isOutside(first, anchor) && isOutside(second, anchor) && movedTogether(first, second)) {
        const moved: number = chargeDay(second.transaction.date);
        return { expectedDay: moved, dayChange: { fromDay: anchor, toDay: moved } };
    }
    return { expectedDay: medianDay(sorted), dayChange: null };
}
