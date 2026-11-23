import { addDaysTo, addMonths, dateInMonth, dayOfMonth, monthOf, signedDaysBetween } from './recurring-dates';
import { Cadence, DAY_TOLERANCE } from './recurring.types';

const STEP_DAYS: Readonly<Partial<Record<Cadence, number>>> = { weekly: 7, biweekly: 14 };
const STEP_MONTHS: Readonly<Partial<Record<Cadence, number>>> = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12 };
const MONTHLY_FACTOR: Readonly<Record<Cadence, number>> = {
    weekly: 52 / 12,
    biweekly: 26 / 12,
    monthly: 1,
    bimonthly: 1 / 2,
    quarterly: 1 / 3,
    semiannual: 1 / 6,
    annual: 1 / 12
};
const MAX_STEPS: number = 600;

export type OccurrenceState = 'upcoming' | 'missed';

export interface ScheduleSeries {
    readonly cadence: Cadence;
    readonly expectedDay: number | null;
    readonly lastDate: string;
}

export interface Occurrence {
    readonly date: string;
    readonly state: OccurrenceState;
}

export function monthlyEquivalent(amountMinor: number, cadence: Cadence): number {
    return Math.round(amountMinor * MONTHLY_FACTOR[cadence]);
}

export function stepFrom(date: string, cadence: Cadence, expectedDay: number | null): string {
    const days: number | undefined = STEP_DAYS[cadence];
    if (days !== undefined) {
        return addDaysTo(date, days);
    }
    const months: number = STEP_MONTHS[cadence] ?? 1;
    return dateInMonth(addMonths(monthOf(date), months), expectedDay ?? dayOfMonth(date));
}

function isPastTolerance(date: string, today: string): boolean {
    return signedDaysBetween(addDaysTo(date, DAY_TOLERANCE), today) > 0;
}

export function upcomingOccurrences(series: ScheduleSeries, today: string, days: number): Occurrence[] {
    const limit: string = addDaysTo(today, days);
    const found: Occurrence[] = [];
    let cursor: string = stepFrom(series.lastDate, series.cadence, series.expectedDay);
    for (let step: number = 0; step < MAX_STEPS && cursor <= limit; step += 1) {
        if (!isPastTolerance(cursor, today)) {
            found.push({ date: cursor, state: 'upcoming' });
        }
        if (isPastTolerance(cursor, today) && step === 0) {
            found.push({ date: cursor, state: 'missed' });
        }
        cursor = stepFrom(cursor, series.cadence, series.expectedDay);
    }
    return found;
}

export function nextChargeDate(series: ScheduleSeries, today: string): string {
    let cursor: string = stepFrom(series.lastDate, series.cadence, series.expectedDay);
    for (let step: number = 0; step < MAX_STEPS && isPastTolerance(cursor, today); step += 1) {
        cursor = stepFrom(cursor, series.cadence, series.expectedDay);
    }
    return cursor;
}
