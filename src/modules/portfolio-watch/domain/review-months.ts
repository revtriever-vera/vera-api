const MONTH_NAMES: readonly string[] = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro'
];

const MONTH_PATTERN: RegExp = /^\d{4}-(0[1-9]|1[0-2])$/;

function partsOf(month: string): [number, number] {
    const [year, number]: number[] = month.split('-').map(Number) as [number, number];
    return [year, number];
}

function monthOfIndex(index: number): string {
    return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function isMonth(value: string): boolean {
    return MONTH_PATTERN.test(value);
}

export function monthAfter(month: string): string {
    const [year, number]: [number, number] = partsOf(month);
    return monthOfIndex(year * 12 + number);
}

export function monthBefore(month: string): string {
    const [year, number]: [number, number] = partsOf(month);
    return monthOfIndex(year * 12 + number - 2);
}

export function daysInMonth(month: string): number {
    const [year, number]: [number, number] = partsOf(month);
    return new Date(Date.UTC(year, number, 0)).getUTCDate();
}

export function firstDayOf(month: string): string {
    return `${month}-01`;
}

export function lastDayOf(month: string): string {
    return `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
    const [year, number]: [number, number] = partsOf(month);
    return `${MONTH_NAMES[number - 1] as string} de ${String(year)}`;
}
