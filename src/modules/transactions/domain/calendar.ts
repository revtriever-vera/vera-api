const DAY_MS: number = 86_400_000;
const DATE_PATTERN: RegExp = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PATTERN: RegExp = /^(\d{4})-(\d{2})$/;

export function isValidDate(value: string): boolean {
    const match: RegExpExecArray | null = DATE_PATTERN.exec(value);
    if (match === null) {
        return false;
    }
    const parsed: Date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return parsed.toISOString().slice(0, 10) === value;
}

export function isValidMonth(value: string): boolean {
    const match: RegExpExecArray | null = MONTH_PATTERN.exec(value);
    return match !== null && Number(match[2]) >= 1 && Number(match[2]) <= 12;
}

export function dayNumber(date: string): number {
    return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / DAY_MS);
}

export function daysBetween(left: string, right: string): number {
    return Math.abs(dayNumber(left) - dayNumber(right));
}

export function addDays(date: string, days: number): string {
    return new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

export function monthOf(date: string): string {
    return date.slice(0, 7);
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

export function firstDayOf(month: string): string {
    return `${month}-01`;
}

export function lastDayOf(month: string): string {
    return `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
}

export function dateInMonth(month: string, day: number): string {
    return `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`;
}
