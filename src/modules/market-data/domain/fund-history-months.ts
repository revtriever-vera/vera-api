const MONTHS_PER_YEAR: number = 12;
const MONTH_START: number = 5;
const MONTH_PREFIX: number = 8;

export interface FundFetchPlan {
    readonly older: readonly string[];
    readonly newer: readonly string[];
}

function monthIndexOf(date: string): number {
    return Number(date.slice(0, 4)) * MONTHS_PER_YEAR + Number(date.slice(MONTH_START, MONTH_START + 2)) - 1;
}

function informeKeyOf(index: number): string {
    const year: number = Math.floor(index / MONTHS_PER_YEAR);
    return `${String(year)}${String((index % MONTHS_PER_YEAR) + 1).padStart(2, '0')}`;
}

export function monthsBetween(from: string, to: string): string[] {
    const first: number = monthIndexOf(from);
    const last: number = monthIndexOf(to);
    return Array.from({ length: Math.max(0, last - first + 1) }, (_unused: unknown, offset: number): string =>
        informeKeyOf(first + offset)
    );
}

export function firstOfMonth(date: string): string {
    return `${date.slice(0, MONTH_PREFIX)}01`;
}

export function monthStartShifted(date: string, months: number): string {
    const key: string = informeKeyOf(monthIndexOf(date) + months);
    return `${key.slice(0, 4)}-${key.slice(4)}-01`;
}

export function fundFetchPlan(coverage: { coveredFrom: string; coveredTo: string } | null, from: string, asOf: string): FundFetchPlan {
    if (coverage === null) {
        return { older: [], newer: monthsBetween(from, asOf) };
    }
    const older: string[] =
        monthIndexOf(from) < monthIndexOf(coverage.coveredFrom) ? monthsBetween(from, coverage.coveredFrom).slice(0, -1) : [];
    const newer: string[] = coverage.coveredTo < asOf ? monthsBetween(coverage.coveredTo, asOf) : [];
    return { older, newer };
}
