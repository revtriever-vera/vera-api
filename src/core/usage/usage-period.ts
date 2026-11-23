import { DateUtil } from '../../shared/utils/date.util';

const PERIOD_LENGTH: number = 7;
const MONTHS_IN_YEAR: number = 12;

export function periodOf(at: Date, timeZone: string): string {
    return DateUtil.localDateIn(timeZone, at).slice(0, PERIOD_LENGTH);
}

export function resetsAtOf(at: Date, timeZone: string): Date {
    return DateUtil.startOfNextMonthIn(timeZone, at);
}

export function oldestPeriodOf(period: string, monthsBack: number): string {
    const year: number = Number(period.slice(0, 4));
    const month: number = Number(period.slice(5, PERIOD_LENGTH));
    const index: number = year * MONTHS_IN_YEAR + (month - 1) - monthsBack;
    const oldestYear: number = Math.floor(index / MONTHS_IN_YEAR);
    const oldestMonth: number = (index % MONTHS_IN_YEAR) + 1;
    return `${String(oldestYear)}-${String(oldestMonth).padStart(2, '0')}`;
}

export function retentionCutoffOf(at: Date, months: number): Date {
    const cutoff: Date = new Date(at);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
    return cutoff;
}
