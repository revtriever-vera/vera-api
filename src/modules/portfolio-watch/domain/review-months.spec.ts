import { describe, expect, it } from 'vitest';
import { coverageMessageOf } from './review-coverage';
import { daysInMonth, firstDayOf, isMonth, lastDayOf, monthAfter, monthBefore, monthLabel } from './review-months';

describe('meses da revisão', () => {
    it('anda para o mês seguinte e para o anterior na virada do ano', () => {
        expect(monthAfter('2026-12')).toBe('2027-01');
        expect(monthAfter('2026-10')).toBe('2026-11');
        expect(monthBefore('2027-01')).toBe('2026-12');
        expect(monthBefore('2026-11')).toBe('2026-10');
    });

    it('conhece os dias do mês, inclusive fevereiro de ano bissexto', () => {
        expect(daysInMonth('2028-02')).toBe(29);
        expect(daysInMonth('2026-02')).toBe(28);
        expect(firstDayOf('2026-10')).toBe('2026-10-01');
        expect(lastDayOf('2026-11')).toBe('2026-11-30');
    });

    it('valida e nomeia o mês', () => {
        expect(isMonth('2026-13')).toBe(false);
        expect(isMonth('2026-1')).toBe(false);
        expect(isMonth('2026-12')).toBe(true);
        expect(monthLabel('2026-03')).toBe('março de 2026');
    });
});

describe('mensagem de cobertura', () => {
    it('diz o que falta em cada caso', () => {
        expect(coverageMessageOf('no_operations', '2026-10')).toBe(
            'A rentabilidade aparece quando as suas operações estiverem importadas.'
        );
        expect(coverageMessageOf('no_previous_snapshot', '2026-10')).toBe('A rentabilidade aparece a partir de novembro de 2026.');
        expect(coverageMessageOf('classes_not_closing', '2026-10')).toContain('operações');
        expect(coverageMessageOf(null, '2026-10')).toBeNull();
    });
});
