const DAY_MS: number = 86_400_000;
const DATE_PATTERN: RegExp = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(date: string): { year: number; month: number; day: number } | null {
    const match: RegExpExecArray | null = DATE_PATTERN.exec(date);
    if (match === null) {
        return null;
    }
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function format(year: number, month: number, day: number): string {
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isDateOnly(value: string): boolean {
    return DATE_PATTERN.test(value);
}

export function addDays(date: string, days: number): string {
    const found: { year: number; month: number; day: number } | null = parts(date);
    if (found === null) {
        return date;
    }
    const shifted: Date = new Date(Date.UTC(found.year, found.month - 1, found.day) + days * DAY_MS);
    return shifted.toISOString().slice(0, 10);
}

export function addMonthsClamped(date: string, months: number): string {
    const found: { year: number; month: number; day: number } | null = parts(date);
    if (found === null) {
        return date;
    }
    const index: number = found.year * 12 + (found.month - 1) + months;
    const year: number = Math.floor(index / 12);
    const month: number = (index % 12) + 1;
    const lastDay: number = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return format(year, month, Math.min(found.day, lastDay));
}
