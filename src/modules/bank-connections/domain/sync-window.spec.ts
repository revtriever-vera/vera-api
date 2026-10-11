import { describe, expect, it } from 'vitest';
import { addDays, addMonthsClamped, isDateOnly } from './date-math';
import { SYNC_OVERLAP_DAYS, syncWindowOf } from './sync-window';

describe('syncWindowOf', () => {
    it('na primeira vez volta o histórico inicial inteiro até hoje', () => {
        expect(syncWindowOf(null, '2026-10-11', 365)).toEqual({ from: '2025-10-11', to: '2026-10-11' });
        expect(syncWindowOf(null, '2026-10-11', 90)).toEqual({ from: '2026-07-13', to: '2026-10-11' });
    });

    it('depois volta 7 dias a partir do que já foi sincronizado', () => {
        expect(SYNC_OVERLAP_DAYS).toBe(7);
        expect(syncWindowOf('2026-10-10', '2026-10-11', 365)).toEqual({ from: '2026-10-03', to: '2026-10-11' });
        expect(syncWindowOf('2026-03-02', '2026-10-11', 365)).toEqual({ from: '2026-02-23', to: '2026-10-11' });
    });

    it('nunca começa depois de hoje', () => {
        expect(syncWindowOf('2026-10-30', '2026-10-11', 365)).toEqual({ from: '2026-10-11', to: '2026-10-11' });
    });
});

describe('date math', () => {
    it('soma dias atravessando mês e ano e devolve o texto original quando inválido', () => {
        expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
        expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
        expect(addDays('nada', 3)).toBe('nada');
    });

    it('soma meses com teto no último dia', () => {
        expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
        expect(addMonthsClamped('2026-11-30', 3)).toBe('2027-02-28');
        expect(addMonthsClamped('2026-05-31', 0)).toBe('2026-05-31');
        expect(addMonthsClamped('nada', 1)).toBe('nada');
    });

    it('reconhece a data de calendário', () => {
        expect(isDateOnly('2026-10-05')).toBe(true);
        expect(isDateOnly('2026-10-05T00:00:00Z')).toBe(false);
    });
});
