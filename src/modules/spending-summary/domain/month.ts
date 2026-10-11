import { FIRST_SUPPORTED_MONTH } from './spending-summary.types';
import { InvalidSummaryMonthError } from './spending-summary.errors';

const MONTH_PATTERN: RegExp = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MONTHS_PER_YEAR: number = 12;

export function monthOfDate(date: string): string {
    return date.slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
    const match: RegExpExecArray | null = MONTH_PATTERN.exec(month);
    const index: number = Number(match?.[1] ?? 0) * MONTHS_PER_YEAR + Number(match?.[2] ?? 1) - 1 + delta;
    const year: number = Math.floor(index / MONTHS_PER_YEAR);
    return `${String(year).padStart(4, '0')}-${String((index % MONTHS_PER_YEAR) + 1).padStart(2, '0')}`;
}

export function lastClosedMonth(today: string): string {
    return addMonths(monthOfDate(today), -1);
}

export function resolveMonth(requested: string | null, today: string): string {
    if (requested === null) {
        return lastClosedMonth(today);
    }
    const current: string = monthOfDate(today);
    if (!MONTH_PATTERN.test(requested) || requested < FIRST_SUPPORTED_MONTH || requested > current) {
        throw new InvalidSummaryMonthError(requested);
    }
    return requested;
}

export function previousMonthOf(month: string): string | null {
    return month <= FIRST_SUPPORTED_MONTH ? null : addMonths(month, -1);
}

export function nextMonthOf(month: string, today: string): string | null {
    return month >= monthOfDate(today) ? null : addMonths(month, 1);
}

export function isPartialMonth(month: string, today: string): boolean {
    return month === monthOfDate(today);
}
