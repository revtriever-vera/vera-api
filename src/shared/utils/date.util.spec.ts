import { describe, expect, it } from 'vitest';
import { DateUtil } from './date.util';

describe('DateUtil', () => {
    it('todayInBrazil reads the date in America/Sao_Paulo, not UTC', () => {
        expect(DateUtil.todayInBrazil(new Date('2026-01-01T02:30:00Z'))).toBe('2025-12-31');
        expect(DateUtil.todayInBrazil(new Date('2026-01-01T04:30:00Z'))).toBe('2026-01-01');
    });

    it('localDateIn formats a date in the given timezone as YYYY-MM-DD', () => {
        expect(DateUtil.localDateIn('America/Sao_Paulo', new Date('2026-03-15T12:00:00Z'))).toBe('2026-03-15');
    });

    it('nowInBrazil returns a Date whose local fields match the Brazil wall clock', () => {
        const result: Date = DateUtil.nowInBrazil(new Date('2026-06-01T15:00:00Z'));

        expect(result.getFullYear()).toBe(2026);
        expect(result.getMonth()).toBe(5);
        expect(result.getDate()).toBe(1);
    });

    it('startOfDayIn and startOfNextDayIn are exactly 24h apart', () => {
        const at: Date = new Date('2026-06-15T18:00:00Z');
        const start: Date = DateUtil.startOfDayIn('America/Sao_Paulo', at);
        const next: Date = DateUtil.startOfNextDayIn('America/Sao_Paulo', at);

        expect(next.getTime() - start.getTime()).toBe(86_400_000);
    });

    it('startOfTodayInBrazil matches todayInBrazil at midnight -03:00', () => {
        const now: Date = new Date('2026-06-15T18:00:00Z');
        const start: Date = DateUtil.startOfTodayInBrazil(now);

        expect(DateUtil.onlyDateString(new Date(start.getTime() + 3 * 3_600_000))).toBe(DateUtil.todayInBrazil(now));
    });

    it('addDays/addHours/addMinutes/subtractHours move the clock as expected', () => {
        const base: Date = new Date('2026-01-01T00:00:00Z');

        expect(DateUtil.addDays(base, 2).toISOString()).toBe('2026-01-03T00:00:00.000Z');
        expect(DateUtil.addHours(base, 5).toISOString()).toBe('2026-01-01T05:00:00.000Z');
        expect(DateUtil.addMinutes(base, 90).toISOString()).toBe('2026-01-01T01:30:00.000Z');
        expect(DateUtil.subtractHours(base, 1).toISOString()).toBe('2025-12-31T23:00:00.000Z');
    });

    it('onlyLocalDateString formats the calendar day the driver parsed for a date column, in any timezone', () => {
        expect(DateUtil.onlyLocalDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
        expect(DateUtil.onlyLocalDateString(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
    });

    it('onlyDateString/startOfDayUtc/endOfDayUtc bound a UTC day', () => {
        const at: string = '2026-05-10T13:45:00Z';

        expect(DateUtil.onlyDateString(new Date(at))).toBe('2026-05-10');
        expect(DateUtil.startOfDayUtc(at).toISOString()).toBe('2026-05-10T00:00:00.000Z');
        expect(DateUtil.endOfDayUtc(at).toISOString()).toBe('2026-05-10T23:59:59.999Z');
    });

    it('differenceInCalendarDays counts calendar days, not 24h windows', () => {
        const left: Date = new Date(2026, 0, 1, 23, 0, 0);
        const right: Date = new Date(2026, 0, 2, 1, 0, 0);

        expect(DateUtil.differenceInCalendarDays(left, right)).toBe(1);
    });

    it('isSameCalendarDay compares calendar dates and treats missing values as equal only to each other', () => {
        expect(DateUtil.isSameCalendarDay(new Date(2026, 0, 1, 23, 0), new Date(2026, 0, 1, 1, 0))).toBe(true);
        expect(DateUtil.isSameCalendarDay('2026-01-01', '2026-01-02')).toBe(false);
        expect(DateUtil.isSameCalendarDay(null, undefined)).toBe(true);
        expect(DateUtil.isSameCalendarDay(null, '2026-01-01')).toBe(false);
        expect(DateUtil.isSameCalendarDay('not-a-date', '2026-01-01')).toBe(false);
    });
});
