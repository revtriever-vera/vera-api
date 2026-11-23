import { describe, expect, it } from 'vitest';
import { oldestPeriodOf, periodOf, resetsAtOf, retentionCutoffOf } from './usage-period';

const SAO_PAULO: string = 'America/Sao_Paulo';

describe('usage-period', () => {
    it('vira o mês às 00:00 do fuso da company, não do UTC', () => {
        expect(periodOf(new Date('2026-11-01T02:59:59.000Z'), SAO_PAULO)).toBe('2026-10');
        expect(periodOf(new Date('2026-11-01T03:00:00.000Z'), SAO_PAULO)).toBe('2026-11');
        expect(periodOf(new Date('2026-10-31T23:59:00.000Z'), 'Asia/Tokyo')).toBe('2026-11');
    });

    it('resetsAt é 00:00 do dia 1º seguinte no fuso, em UTC', () => {
        expect(resetsAtOf(new Date('2026-10-15T12:00:00.000Z'), SAO_PAULO).toISOString()).toBe('2026-11-01T03:00:00.000Z');
        expect(resetsAtOf(new Date('2026-12-31T12:00:00.000Z'), SAO_PAULO).toISOString()).toBe('2027-01-01T03:00:00.000Z');
        expect(resetsAtOf(new Date('2026-10-15T12:00:00.000Z'), 'Asia/Tokyo').toISOString()).toBe('2026-10-31T15:00:00.000Z');
    });

    it('volta N meses atravessando o ano', () => {
        expect(oldestPeriodOf('2026-11', 12)).toBe('2025-11');
        expect(oldestPeriodOf('2026-03', 12)).toBe('2025-03');
        expect(oldestPeriodOf('2026-01', 1)).toBe('2025-12');
        expect(oldestPeriodOf('2026-06', 0)).toBe('2026-06');
    });

    it('o corte de retenção volta 13 meses', () => {
        expect(retentionCutoffOf(new Date('2026-11-15T00:00:00.000Z'), 13).toISOString()).toBe('2025-10-15T00:00:00.000Z');
    });
});
