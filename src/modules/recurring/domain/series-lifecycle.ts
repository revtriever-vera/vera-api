import { CADENCE_RULES } from './cadence';
import { addDaysTo, dayOfMonth, signedDaysBetween } from './recurring-dates';
import { median } from './recurring-math';
import { SERIES_KINDS, SERIES_NAME_MAX_LENGTH, SeriesKind, STOP_CADENCE_FACTOR, STOP_GRACE_DAYS } from './recurring-series.types';
import { Cadence, CADENCES, SUBSCRIPTIONS_CATEGORY } from './recurring.types';

const NOMINAL_DAYS: Readonly<Record<Cadence, number>> = {
    weekly: 7,
    biweekly: 15,
    monthly: 30,
    bimonthly: 61,
    quarterly: 91,
    semiannual: 182,
    annual: 365
};

const BILL_CATEGORIES: ReadonlySet<string> = new Set<string>(['housing', 'education', 'health', 'home_services', 'taxes_fees']);
const DATELESS_CADENCES: ReadonlySet<Cadence> = new Set<Cadence>([CADENCES.weekly, CADENCES.biweekly]);

export function nominalDays(cadence: Cadence): number {
    return NOMINAL_DAYS[cadence];
}

export function stopDeadline(lastDate: string, cadence: Cadence): string {
    return addDaysTo(lastDate, Math.ceil(nominalDays(cadence) * STOP_CADENCE_FACTOR) + STOP_GRACE_DAYS);
}

export function isOverdue(lastDate: string, cadence: Cadence, today: string): boolean {
    return signedDaysBetween(stopDeadline(lastDate, cadence), today) > 0;
}

export function kindOf(categoryKey: string | null, knownSubscription: boolean): SeriesKind {
    if (knownSubscription || categoryKey === SUBSCRIPTIONS_CATEGORY) {
        return SERIES_KINDS.subscription;
    }
    return categoryKey !== null && BILL_CATEGORIES.has(categoryKey) ? SERIES_KINDS.bill : SERIES_KINDS.other;
}

export function guessCadence(sortedDates: readonly string[]): Cadence {
    const intervals: number[] = [];
    for (let index: number = 1; index < sortedDates.length; index += 1) {
        intervals.push(signedDaysBetween(sortedDates[index - 1] ?? '', sortedDates[index] ?? ''));
    }
    if (intervals.length === 0) {
        return CADENCES.monthly;
    }
    const typical: number = median(intervals);
    const rule: (typeof CADENCE_RULES)[number] | undefined = CADENCE_RULES.find(
        (candidate: (typeof CADENCE_RULES)[number]): boolean => typical >= candidate.minDays && typical <= candidate.maxDays
    );
    return rule?.cadence ?? CADENCES.monthly;
}

export function expectedDayFor(cadence: Cadence, date: string): number | null {
    return DATELESS_CADENCES.has(cadence) ? null : dayOfMonth(date);
}

export function titleCase(text: string): string {
    return text
        .toLowerCase()
        .split(' ')
        .filter((word: string): boolean => word.length > 0)
        .map((word: string): string => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
        .join(' ');
}

export function clampName(name: string): string {
    return name.trim().slice(0, SERIES_NAME_MAX_LENGTH);
}
