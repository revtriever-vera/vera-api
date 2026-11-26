import { describe, expect, it } from 'vitest';
import { FUND_WINDOWS } from './fund-performance.types';
import { fundHistoryStart, fundWindows, lastQuotaOf } from './fund-windows';

const POINTS = [
    { date: '2025-03-19', quota: '1.000000' },
    { date: '2025-09-19', quota: '1.060000' },
    { date: '2025-12-19', quota: '1.100000' },
    { date: '2026-02-19', quota: '1.150000' },
    { date: '2026-03-19', quota: '1.200000' }
];

describe('rentabilidade da cota por janela', () => {
    it('divide a última cota pela cota do começo da janela, em pontos-base', () => {
        const bps = fundWindows(POINTS, '2026-03-20', FUND_WINDOWS);

        expect(bps).toEqual({ m1: 435, m3: 909, m6: 1321, m12: 2000, m36: null });
    });

    it('janela sem cota perto do começo fica sem histórico', () => {
        const bps = fundWindows(POINTS.slice(3), '2026-03-20', FUND_WINDOWS);

        expect(bps).toEqual({ m1: 435, m3: null, m6: null, m12: null, m36: null });
    });

    it('só calcula as janelas pedidas e ignora cota depois da data de referência', () => {
        const bps = fundWindows(POINTS, '2026-03-01', ['m12']);

        expect(bps.m12).toBeNull();
        expect(bps.m1).toBeNull();
        expect(lastQuotaOf(POINTS, '2026-03-01')?.date).toBe('2026-02-19');
    });

    it('sem nenhuma cota tudo vem vazio', () => {
        expect(fundWindows([], '2026-03-20', FUND_WINDOWS)).toEqual({ m1: null, m3: null, m6: null, m12: null, m36: null });
        expect(lastQuotaOf([], '2026-03-20')).toBeUndefined();
    });

    it('o histórico começa dez dias antes da janela mais longa', () => {
        expect(fundHistoryStart('2026-03-20', ['m1', 'm12'])).toBe('2025-03-10');
        expect(fundHistoryStart('2026-03-20', FUND_WINDOWS)).toBe('2023-03-10');
    });
});
