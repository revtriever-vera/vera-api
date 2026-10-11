import { describe, expect, it } from 'vitest';
import { weekdayPoints } from '../../../../../test/support/fixed-income-fixtures';
import { accrualDays, addDays, buildCdiCurve, daysBetween, isWeekday, lowerBound } from './business-days';

describe('business days', () => {
    it('opera sobre datas ISO sem depender do fuso', () => {
        expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
        expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
        expect(daysBetween('2025-01-01', '2026-01-01')).toBe(365);
        expect(isWeekday('2025-01-04')).toBe(false);
        expect(isWeekday('2025-01-05')).toBe(false);
        expect(isWeekday('2025-01-06')).toBe(true);
    });

    it('ordena a série e acha o limite inferior', () => {
        const curve = buildCdiCurve([
            { date: '2025-01-08', value: '0.05' },
            { date: '2025-01-06', value: '0.04' }
        ]);

        expect(curve.dates).toEqual(['2025-01-06', '2025-01-08']);
        expect(lowerBound(curve.dates, '2025-01-07')).toBe(1);
        expect(lowerBound(curve.dates, '2025-01-09')).toBe(2);
    });

    it('janela vazia ou invertida não tem dias nem exige série', () => {
        expect(accrualDays(buildCdiCurve([]), '2025-01-06', '2025-01-06')).toEqual([]);
        expect(accrualDays(buildCdiCurve([]), '2025-01-07', '2025-01-06')).toEqual([]);
    });

    it('usa só as datas publicadas dentro da janela e projeta o resto em dias de semana', () => {
        const curve = buildCdiCurve(weekdayPoints('2025-01-06', '2025-01-10', '0.05'));

        const days = accrualDays(curve, '2025-01-08', '2025-01-15');

        expect(days?.map((day) => [day.date, day.projected])).toEqual([
            ['2025-01-08', false],
            ['2025-01-09', false],
            ['2025-01-10', false],
            ['2025-01-13', true],
            ['2025-01-14', true]
        ]);
    });

    it('janela inteira depois do fim da série é toda projetada', () => {
        const curve = buildCdiCurve(weekdayPoints('2025-01-06', '2025-01-10', '0.05'));

        expect(accrualDays(curve, '2025-01-13', '2025-01-15')?.every((day) => day.projected)).toBe(true);
    });
});
