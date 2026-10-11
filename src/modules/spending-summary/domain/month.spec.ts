import { describe, expect, it } from 'vitest';
import { InvalidSummaryMonthError } from './spending-summary.errors';
import { addMonths, isPartialMonth, lastClosedMonth, monthOfDate, nextMonthOf, previousMonthOf, resolveMonth } from './month';

describe('month', () => {
    it('o último mês fechado de 11/10 é setembro', () => {
        expect(lastClosedMonth('2026-10-11')).toBe('2026-09');
    });

    it('o mês fechado respeita a data local da empresa (01/10 às 00:30 em São Paulo é outubro)', () => {
        expect(lastClosedMonth('2026-10-01')).toBe('2026-09');
        expect(lastClosedMonth('2026-09-30')).toBe('2026-08');
    });

    it('vira o ano nos dois sentidos', () => {
        expect(lastClosedMonth('2027-01-05')).toBe('2026-12');
        expect(addMonths('2026-12', 1)).toBe('2027-01');
        expect(addMonths('2026-01', -1)).toBe('2025-12');
        expect(addMonths('2026-10', -3)).toBe('2026-07');
    });

    it('sem parâmetro devolve o último mês fechado', () => {
        expect(resolveMonth(null, '2026-10-11')).toBe('2026-09');
    });

    it('aceita do primeiro mês suportado ao mês corrente', () => {
        expect(resolveMonth('2000-01', '2026-10-11')).toBe('2000-01');
        expect(resolveMonth('2026-10', '2026-10-11')).toBe('2026-10');
    });

    it.each(['2026-11', '1999-12', '2026-13', '2026-00', '2026-9', 'setembro', '2026-09-01', ''])('recusa %s', (value: string) => {
        expect(() => resolveMonth(value, '2026-10-11')).toThrow(InvalidSummaryMonthError);
    });

    it('calcula mês anterior e próximo, sem passar do mês corrente', () => {
        expect(previousMonthOf('2026-09')).toBe('2026-08');
        expect(previousMonthOf('2000-01')).toBeNull();
        expect(nextMonthOf('2026-09', '2026-10-11')).toBe('2026-10');
        expect(nextMonthOf('2026-10', '2026-10-11')).toBeNull();
        expect(nextMonthOf('2026-12', '2026-12-31')).toBeNull();
        expect(nextMonthOf('2026-11', '2026-12-31')).toBe('2026-12');
    });

    it('o mês corrente é parcial', () => {
        expect(isPartialMonth('2026-10', '2026-10-11')).toBe(true);
        expect(isPartialMonth('2026-09', '2026-10-11')).toBe(false);
        expect(monthOfDate('2026-10-11')).toBe('2026-10');
    });
});
