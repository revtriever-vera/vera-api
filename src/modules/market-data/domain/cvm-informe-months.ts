import { DateUtil } from '../../../shared/utils/date.util';

const PREVIOUS_MONTH_BUSINESS_DAYS: number = 5;
const SUNDAY: number = 0;
const SATURDAY: number = 6;
const ISO_PARTS: number = 3;

function monthKey(year: number, month: number): string {
    return `${String(year)}${String(month).padStart(2, '0')}`;
}

function businessDaysElapsed(year: number, month: number, day: number): number {
    let count: number = 0;
    for (let current: number = 1; current <= day; current += 1) {
        const weekday: number = new Date(Date.UTC(year, month - 1, current)).getUTCDay();
        count += weekday === SUNDAY || weekday === SATURDAY ? 0 : 1;
    }
    return count;
}

export function informeMonthsOf(now: Date): string[] {
    const parts: number[] = DateUtil.todayInBrazil(now).split('-').slice(0, ISO_PARTS).map(Number);
    const [year = 0, month = 1, day = 1] = parts;
    const current: string = monthKey(year, month);
    if (businessDaysElapsed(year, month, day) > PREVIOUS_MONTH_BUSINESS_DAYS) {
        return [current];
    }
    const previous: string = month === 1 ? monthKey(year - 1, 12) : monthKey(year, month - 1);
    return [current, previous];
}
