import { describe, expect, it } from 'vitest';
import { daysBetween, firstDayOf, isCalendarDate, lastDayOf, monthOf } from './export-period';

describe('export-period', () => {
    it('finds the month edges including leap years', () => {
        expect(firstDayOf('2026-09')).toBe('2026-09-01');
        expect(lastDayOf('2026-09')).toBe('2026-09-30');
        expect(lastDayOf('2024-02')).toBe('2024-02-29');
        expect(lastDayOf('2026-12')).toBe('2026-12-31');
        expect(monthOf('2026-09-14')).toBe('2026-09');
    });

    it('validates calendar dates', () => {
        expect(isCalendarDate('2026-09-14')).toBe(true);
        expect(isCalendarDate('2026-02-30')).toBe(false);
        expect(isCalendarDate('14/09/2026')).toBe(false);
    });

    it('counts the days between dates with sign', () => {
        expect(daysBetween('2026-09-01', '2026-09-30')).toBe(29);
        expect(daysBetween('2026-09-30', '2026-09-01')).toBe(-29);
    });
});
