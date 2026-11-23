import { describe, expect, it } from 'vitest';
import { isFirstOfMonth, isNoticeDue, isoDatePlusDays, noticeLeadDate } from './goal-notice-due';

describe('goal-notice-due', () => {
    it('soma dias de calendário atravessando mês e ano', () => {
        expect(isoDatePlusDays('2026-12-15', 30)).toBe('2027-01-14');
        expect(isoDatePlusDays('2028-02-01', 30)).toBe('2028-03-02');
    });

    it('a data de aviso é 30 dias depois de hoje', () => {
        expect(noticeLeadDate('2026-11-23')).toBe('2026-12-23');
    });

    it('todo objetivo vence no dia 1', () => {
        expect(isFirstOfMonth('2026-12-01')).toBe(true);
        expect(isNoticeDue('2026-12-01', '2030-01-01')).toBe(true);
    });

    it('fora do dia 1 só vence o objetivo cuja data está a 30 dias', () => {
        expect(isNoticeDue('2026-11-23', '2026-12-23')).toBe(true);
        expect(isNoticeDue('2026-11-23', '2026-12-24')).toBe(false);
    });
});
