const MONTH_PATTERN: RegExp = /^(\d{4})-(\d{2})$/;

export function firstDayOf(month: string): string {
    return `${month}-01`;
}

export function lastDayOf(month: string): string {
    const match: RegExpExecArray | null = MONTH_PATTERN.exec(month);
    const last: number = new Date(Date.UTC(Number(match?.[1] ?? 0), Number(match?.[2] ?? 1), 0)).getUTCDate();
    return `${month}-${String(last).padStart(2, '0')}`;
}

export function monthOf(date: string): string {
    return date.slice(0, 7);
}

export function isCalendarDate(value: string): boolean {
    const parsed: Date = new Date(`${value}T00:00:00Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function daysBetween(from: string, to: string): number {
    return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}
