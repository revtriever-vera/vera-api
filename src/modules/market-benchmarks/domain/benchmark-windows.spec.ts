import { describe, expect, it } from 'vitest';
import { BCB_CDI_DAILY, BCB_IPCA_MONTHLY } from '../../../../test/support/benchmark-fixtures';
import {
    cdiWindows,
    closeWindows,
    historyStart,
    ipcaWindows,
    isDailyStale,
    isMonthlyStale,
    lastDateOf,
    selicTargetBps
} from './benchmark-windows';
import { SeriesPointInput } from './benchmark.types';

const CDI: SeriesPointInput[] = BCB_CDI_DAILY.map(([date, value]): SeriesPointInput => ({ date, value }));
const IPCA: SeriesPointInput[] = BCB_IPCA_MONTHLY.map(([date, value]): SeriesPointInput => ({ date, value }));

describe('CDI acumulado', () => {
    it('bate com os números públicos do Banco Central em 31/12/2025 (CDI de 2025: 14,32%; dezembro: 1,22%)', () => {
        const windows = cdiWindows(CDI, '2025-12-31');

        expect(windows.ytd).toBe(1432);
        expect(windows.m12).toBe(1432);
        expect(windows.m1).toBe(122);
        expect(windows.m3).toBe(359);
        expect(windows.m6).toBe(743);
    });

    it('janela que começa antes do primeiro ponto guardado fica sem número', () => {
        const windows = cdiWindows(CDI, '2025-12-31');

        expect(windows.m24).toBeNull();
        expect(windows.m36).toBeNull();
    });

    it('usa só os pontos até a data de referência', () => {
        const windows = cdiWindows(CDI, '2025-06-30');

        expect(windows.ytd).toBe(642);
        expect(lastDateOf(CDI, '2025-06-30')).toBe('2025-06-30');
    });

    it('sem nenhum ponto, tudo vazio', () => {
        expect(Object.values(cdiWindows([], '2025-12-31')).every((value) => value === null)).toBe(true);
        expect(lastDateOf([], '2025-12-31')).toBeNull();
    });
});

describe('IPCA acumulado', () => {
    it('bate com os números públicos do IBGE (IPCA de 2025: 4,26%; 2024 e 2025: 9,30%)', () => {
        const windows = ipcaWindows(IPCA, '2026-01-20');

        expect(windows.m1).toBe(33);
        expect(windows.m12).toBe(426);
        expect(windows.ytd).toBe(426);
        expect(windows.m24).toBe(930);
        expect(windows.m36).toBe(1435);
    });

    it('o ano até o último mês soma só os meses do ano', () => {
        const windows = ipcaWindows(IPCA, '2025-06-20');

        expect(windows.ytd).toBe(299);
        expect(windows.m3).toBe(93);
    });

    it('falta de mês no meio da janela deixa a janela sem número', () => {
        const gap: SeriesPointInput[] = IPCA.filter((point) => point.date !== '2025-09-01');

        const windows = ipcaWindows(gap, '2026-01-20');

        expect(windows.m3).toBe(60);
        expect(windows.m6).toBeNull();
        expect(windows.m12).toBeNull();
        expect(windows.m1).toBe(33);
    });

    it('série mais curta que a janela fica sem número', () => {
        const windows = ipcaWindows(IPCA.slice(-6), '2026-01-20');

        expect(windows.m6).toBe(124);
        expect(windows.m12).toBeNull();
    });

    it('sem nenhum ponto, tudo vazio', () => {
        expect(Object.values(ipcaWindows([], '2026-01-20')).every((value) => value === null)).toBe(true);
    });
});

describe('Ibovespa pelos fechamentos', () => {
    const closes = [
        { date: '2025-06-27', close: '100000' },
        { date: '2025-09-30', close: '110000' },
        { date: '2025-11-28', close: '120000' },
        { date: '2025-12-30', close: '130000' },
        { date: '2025-12-31', close: '132000' }
    ];

    it('compara o último fechamento com o último fechamento em ou antes do início da janela', () => {
        const windows = closeWindows(closes, '2025-12-31');

        expect(windows.m1).toBe(1000);
        expect(windows.m3).toBe(2000);
        expect(windows.m6).toBe(3200);
        expect(windows.ytd).toBeNull();
    });

    it('sem fechamento em ou antes do início, a janela fica sem número', () => {
        const windows = closeWindows(closes.slice(2), '2025-12-31');

        expect(windows.m3).toBeNull();
        expect(windows.m1).toBe(1000);
    });

    it('o ano usa o último fechamento do ano anterior', () => {
        const withPriorYear = [{ date: '2024-12-30', close: '120000' }, ...closes];

        expect(closeWindows(withPriorYear, '2025-12-31').ytd).toBe(1000);
    });

    it('sem nenhum fechamento, tudo vazio', () => {
        expect(Object.values(closeWindows([], '2025-12-31')).every((value) => value === null)).toBe(true);
    });
});

describe('Selic meta e atraso', () => {
    it('a Selic meta é o último valor em ou antes da data, em pontos-base', () => {
        const points: SeriesPointInput[] = [
            { date: '2026-11-01', value: '13.75' },
            { date: '2026-11-24', value: '13.75' },
            { date: '2026-12-09', value: '13.50' }
        ];

        expect(selicTargetBps(points, '2026-11-25')).toBe(1375);
        expect(selicTargetBps([], '2026-11-25')).toBeNull();
    });

    it('diz quando a série ficou para trás', () => {
        expect(isDailyStale('2025-12-31', '2026-01-05', 5)).toBe(false);
        expect(isDailyStale('2025-12-31', '2026-01-07', 5)).toBe(true);
        expect(isDailyStale(null, '2026-01-07', 5)).toBe(true);
        expect(isMonthlyStale('2025-10-01', '2025-12-20')).toBe(false);
        expect(isMonthlyStale('2025-09-01', '2025-12-20')).toBe(true);
        expect(isMonthlyStale(null, '2025-12-20')).toBe(true);
    });

    it('carrega o histórico com folga antes do início da janela mais longa', () => {
        expect(historyStart('2026-11-25', 36)).toBe('2023-11-05');
    });
});
