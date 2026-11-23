const DAY_MS: number = 86_400_000;
const MONTH_PATTERN: RegExp = /^(\d{4})-(\d{2})/;

export function dayNumber(date: string): number {
    return Math.floor(new Date(`${date.slice(0, 10)}T00:00:00Z`).getTime() / DAY_MS);
}

export function daysBetween(left: string, right: string): number {
    return Math.abs(dayNumber(left) - dayNumber(right));
}

export function signedDaysBetween(from: string, to: string): number {
    return dayNumber(to) - dayNumber(from);
}

export function monthOf(date: string): string {
    return date.slice(0, 7);
}

export function dayOfMonth(date: string): number {
    return Number(date.slice(8, 10));
}

export function addMonths(month: string, delta: number): string {
    const match: RegExpExecArray | null = MONTH_PATTERN.exec(month);
    const index: number = Number(match?.[1] ?? 0) * 12 + Number(match?.[2] ?? 1) - 1 + delta;
    const year: number = Math.floor(index / 12);
    return `${String(year).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function daysInMonth(month: string): number {
    const match: RegExpExecArray | null = MONTH_PATTERN.exec(month);
    return new Date(Date.UTC(Number(match?.[1] ?? 0), Number(match?.[2] ?? 1), 0)).getUTCDate();
}

export function dateInMonth(month: string, day: number): string {
    return `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`;
}

export function isLastDayOfMonth(date: string): boolean {
    return dayOfMonth(date) === daysInMonth(monthOf(date));
}

export function distanceToDay(date: string, expectedDay: number): number {
    const month: string = monthOf(date);
    return Math.min(
        daysBetween(date, dateInMonth(addMonths(month, -1), expectedDay)),
        daysBetween(date, dateInMonth(month, expectedDay)),
        daysBetween(date, dateInMonth(addMonths(month, 1), expectedDay))
    );
}

export function addDaysTo(date: string, days: number): string {
    return new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);
}
