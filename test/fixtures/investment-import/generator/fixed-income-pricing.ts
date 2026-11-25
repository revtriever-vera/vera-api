import { cdiAnnualPercent, ipcaMonthlyPercent } from './reference-series';

export type RateSpec =
    | { readonly kind: 'cdi-percent'; readonly percent: number }
    | { readonly kind: 'ipca-spread'; readonly annualPercent: number }
    | { readonly kind: 'pre'; readonly annualPercent: number };

export const FACE_UNIT_PRICE: number = 1000;
const BUSINESS_DAYS_PER_YEAR: number = 252;
const DAY_MS: number = 86_400_000;

function parseIso(date: string): Date {
    return new Date(`${date}T00:00:00Z`);
}

function businessDaysBetween(from: string, to: string): number {
    const end: number = parseIso(to).getTime();
    let count: number = 0;
    for (let time: number = parseIso(from).getTime() + DAY_MS; time <= end; time += DAY_MS) {
        const weekday: number = new Date(time).getUTCDay();
        count += weekday === 0 || weekday === 6 ? 0 : 1;
    }
    return count;
}

function cdiFactor(from: string, to: string, percent: number): number {
    const end: number = parseIso(to).getTime();
    let factor: number = 1;
    for (let time: number = parseIso(from).getTime() + DAY_MS; time <= end; time += DAY_MS) {
        const day: Date = new Date(time);
        const weekday: number = day.getUTCDay();
        const daily: number = (1 + cdiAnnualPercent(day.getUTCFullYear(), day.getUTCMonth() + 1) / 100) ** (1 / BUSINESS_DAYS_PER_YEAR) - 1;
        factor *= weekday === 0 || weekday === 6 ? 1 : 1 + (daily * percent) / 100;
    }
    return factor;
}

function ipcaFactor(from: string, to: string): number {
    const start: Date = parseIso(from);
    const end: Date = parseIso(to);
    let factor: number = 1;
    let year: number = start.getUTCFullYear();
    let month: number = start.getUTCMonth() + 1;
    while (year < end.getUTCFullYear() || (year === end.getUTCFullYear() && month < end.getUTCMonth() + 1)) {
        factor *= 1 + ipcaMonthlyPercent(year, month) / 100;
        year += month === 12 ? 1 : 0;
        month = month === 12 ? 1 : month + 1;
    }
    return factor;
}

function annualFactor(annualPercent: number, from: string, to: string): number {
    return (1 + annualPercent / 100) ** (businessDaysBetween(from, to) / BUSINESS_DAYS_PER_YEAR);
}

function growthFactor(rate: RateSpec, from: string, to: string): number {
    if (rate.kind === 'cdi-percent') {
        return cdiFactor(from, to, rate.percent);
    }
    if (rate.kind === 'ipca-spread') {
        return ipcaFactor(from, to) * annualFactor(rate.annualPercent, from, to);
    }
    return annualFactor(rate.annualPercent, from, to);
}

export function curveUnitPrice(rate: RateSpec, issueDate: string, referenceDate: string): number {
    return Math.round(FACE_UNIT_PRICE * growthFactor(rate, issueDate, referenceDate) * 100) / 100;
}
