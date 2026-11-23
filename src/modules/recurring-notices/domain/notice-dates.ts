import { DateUtil } from '../../../shared/utils/date.util';
import { DAYS_IN_WEEK, MONDAY, SEND_HOUR } from './recurring-notices.types';

const DAY_MS: number = 86_400_000;
const EPOCH_WEEKDAY: number = 4;
const NOON_UTC: string = 'T12:00:00Z';

function dayNumberOf(date: string): number {
    return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / DAY_MS);
}

export function addDays(date: string, days: number): string {
    return new Date((dayNumberOf(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

export function weekdayIndexOf(date: string): number {
    return (dayNumberOf(date) + EPOCH_WEEKDAY) % DAYS_IN_WEEK;
}

export function mondayOnOrAfter(date: string): string {
    return addDays(date, (MONDAY - weekdayIndexOf(date) + DAYS_IN_WEEK) % DAYS_IN_WEEK);
}

export function sendInstant(timeZone: string, date: string): Date {
    let anchor: Date = new Date(`${date}${NOON_UTC}`);
    const seen: string = DateUtil.localDateIn(timeZone, anchor);
    if (seen !== date) {
        anchor = DateUtil.addHours(anchor, seen > date ? -24 : 24);
    }
    return DateUtil.addHours(DateUtil.startOfDayIn(timeZone, anchor), SEND_HOUR);
}

export interface WeekSlot {
    readonly monday: string;
    readonly at: Date;
}

export function nextWeekSlot(timeZone: string, now: Date): WeekSlot {
    let monday: string = mondayOnOrAfter(DateUtil.localDateIn(timeZone, now));
    let at: Date = sendInstant(timeZone, monday);
    if (at.getTime() <= now.getTime()) {
        monday = addDays(monday, DAYS_IN_WEEK);
        at = sendInstant(timeZone, monday);
    }
    return { monday, at };
}

export function dueInstant(timeZone: string, debitDate: string): Date {
    return sendInstant(timeZone, addDays(debitDate, -1));
}
