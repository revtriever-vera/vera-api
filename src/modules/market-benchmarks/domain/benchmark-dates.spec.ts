import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysBetween, monthIndexOf, yearEndBefore } from './benchmark-dates';

describe('datas dos indicadores', () => {
    it('soma meses prendendo o dia ao fim do mês de chegada', () => {
        expect(addMonths('2025-12-31', -1)).toBe('2025-11-30');
        expect(addMonths('2024-03-31', -1)).toBe('2024-02-29');
        expect(addMonths('2025-03-31', -1)).toBe('2025-02-28');
        expect(addMonths('2025-01-15', -36)).toBe('2022-01-15');
        expect(addMonths('2025-11-25', 3)).toBe('2026-02-25');
    });

    it('soma dias, conta dias e acha o fim do ano anterior', () => {
        expect(addDays('2025-12-28', 5)).toBe('2026-01-02');
        expect(daysBetween('2025-11-30', '2025-12-31')).toBe(31);
        expect(yearEndBefore('2026-03-10')).toBe('2025-12-31');
        expect(monthIndexOf('2026-01')).toBe(monthIndexOf('2025-12') + 1);
    });
});
