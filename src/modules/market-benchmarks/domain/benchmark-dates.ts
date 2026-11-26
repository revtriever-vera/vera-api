const DAY_MS: number = 86_400_000;
const MONTHS_PER_YEAR: number = 12;

export function addDays(date: string, days: number): string {
    return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function addMonths(date: string, months: number): string {
    const year: number = Number(date.slice(0, 4));
    const monthIndex: number = Number(date.slice(5, 7)) - 1 + months;
    const targetYear: number = year + Math.floor(monthIndex / MONTHS_PER_YEAR);
    const targetMonth: number = ((monthIndex % MONTHS_PER_YEAR) + MONTHS_PER_YEAR) % MONTHS_PER_YEAR;
    const lastDay: number = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    const day: number = Math.min(Number(date.slice(8, 10)), lastDay);
    return new Date(Date.UTC(targetYear, targetMonth, day)).toISOString().slice(0, 10);
}

export function monthIndexOf(monthKey: string): number {
    return Number(monthKey.slice(0, 4)) * MONTHS_PER_YEAR + Number(monthKey.slice(5, 7)) - 1;
}

export function yearEndBefore(date: string): string {
    return `${String(Number(date.slice(0, 4)) - 1)}-12-31`;
}
