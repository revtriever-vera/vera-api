import { describe, expect, it } from 'vitest';
import { isoWeekOf, weeklyNoticeKeyOf } from './weekly-changes';

describe('isoWeekOf', () => {
    it('conta a semana ISO, com segunda-feira como primeiro dia', () => {
        expect(isoWeekOf('2026-12-07')).toBe('2026-W50');
        expect(isoWeekOf('2026-12-13')).toBe('2026-W50');
        expect(isoWeekOf('2026-12-14')).toBe('2026-W51');
    });

    it('na virada do ano usa o ano da semana ISO', () => {
        expect(isoWeekOf('2027-01-01')).toBe('2026-W53');
        expect(isoWeekOf('2024-12-30')).toBe('2025-W01');
    });

    it('a chave do aviso carrega o tipo e a semana', () => {
        expect(weeklyNoticeKeyOf('2026-W50')).toBe('portfolio_weekly_changes:2026-W50');
    });
});
