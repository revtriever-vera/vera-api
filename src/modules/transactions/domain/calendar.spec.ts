import { describe, expect, it } from 'vitest';
import {
    addDays,
    addMonths,
    dateInMonth,
    dayNumber,
    daysBetween,
    daysInMonth,
    firstDayOf,
    isValidDate,
    isValidMonth,
    lastDayOf,
    monthOf
} from './calendar';

describe('calendar', () => {
    it('valida datas de calendário e meses', () => {
        expect(isValidDate('2026-02-28')).toBe(true);
        expect(isValidDate('2026-02-29')).toBe(false);
        expect(isValidDate('2024-02-29')).toBe(true);
        expect(isValidDate('2026-9-1')).toBe(false);
        expect(isValidMonth('2026-12')).toBe(true);
        expect(isValidMonth('2026-13')).toBe(false);
        expect(isValidMonth('2026')).toBe(false);
    });

    it('conta e soma dias sem depender de fuso', () => {
        expect(daysBetween('2026-09-30', '2026-10-01')).toBe(1);
        expect(daysBetween('2026-10-01', '2026-09-30')).toBe(1);
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
        expect(dayNumber('1970-01-02')).toBe(1);
    });

    it('soma meses atravessando o ano e acha os limites do mês', () => {
        expect(addMonths('2026-10', -4)).toBe('2026-06');
        expect(addMonths('2026-01', -1)).toBe('2025-12');
        expect(addMonths('2026-11', 3)).toBe('2027-02');
        expect(monthOf('2026-10-11')).toBe('2026-10');
        expect(daysInMonth('2026-02')).toBe(28);
        expect(daysInMonth('2028-02')).toBe(29);
        expect(firstDayOf('2026-09')).toBe('2026-09-01');
        expect(lastDayOf('2026-09')).toBe('2026-09-30');
    });

    it('limita o dia ao último dia do mês', () => {
        expect(dateInMonth('2026-09', 31)).toBe('2026-09-30');
        expect(dateInMonth('2026-02', 31)).toBe('2026-02-28');
        expect(dateInMonth('2026-10', 31)).toBe('2026-10-31');
        expect(dateInMonth('2026-10', 5)).toBe('2026-10-05');
    });
});
