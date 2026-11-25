import { describe, expect, it } from 'vitest';
import type { BenchmarkWindows } from '../../../market-benchmarks/services/benchmark.service';
import { buildBenchmarksContext } from './benchmarks.context';

const WINDOWS: BenchmarkWindows = {
    asOf: '2025-12-31',
    cdi: {
        source: 'Banco Central, série 12',
        lastDate: '2025-12-31',
        stale: false,
        windows: { m1: 122, m3: 359, m6: 743, m12: 1432, m24: null, m36: null, ytd: 1432 }
    },
    ipca: {
        source: 'Banco Central, série 433',
        lastDate: '2025-12-01',
        stale: false,
        windows: { m1: 33, m3: 60, m6: 124, m12: 426, m24: 930, m36: 1435, ytd: 426 }
    },
    selicTarget: { source: 'Banco Central, série 432', lastDate: '2025-12-30', stale: false, bps: 1500 },
    ibovespa: {
        state: 'ok',
        source: 'brapi',
        lastDate: '2025-12-30',
        stale: false,
        windows: { m1: 667, m3: 900, m6: null, m12: null, m24: null, m36: null, ytd: null }
    }
};

describe('contexto dos indicadores de mercado', () => {
    it('formata em pt-BR com duas casas, a data até onde vai e a fonte de cada série', () => {
        const built = buildBenchmarksContext(WINDOWS, undefined, 'pt-BR');

        expect(built.payload.referencia).toBe('2025-12-31');
        expect(built.payload.cdi).toEqual({
            fonte: 'Banco Central, série 12',
            ate: '2025-12-31',
            atrasado: false,
            acumulado: [
                { periodo: '1 mês', valor: '1,22%' },
                { periodo: '3 meses', valor: '3,59%' },
                { periodo: '6 meses', valor: '7,43%' },
                { periodo: '12 meses', valor: '14,32%' },
                { periodo: 'no ano', valor: '14,32%' }
            ],
            sem_historico: ['24 meses', '36 meses']
        });
        expect(built.payload.ipca.ate).toBe('2025-12');
        expect(built.payload.ipca.acumulado.at(-2)).toEqual({ periodo: '36 meses', valor: '14,35%' });
        expect(built.payload.selic_meta).toEqual({
            fonte: 'Banco Central, série 432',
            ate: '2025-12-30',
            atrasado: false,
            valor: '15,00%'
        });
        expect(built.payload.ibovespa).toMatchObject({ status: 'ok', fonte: 'brapi', ate: '2025-12-30' });
        expect(built.payload.ibovespa.sem_historico).toEqual(['6 meses', '12 meses', '24 meses', '36 meses', 'no ano']);
    });

    it('cita os números exibidos para o guarda de números: percentuais, janelas e partes da data', () => {
        const built = buildBenchmarksContext(WINDOWS, undefined, 'pt-BR');

        expect(built.numbers).toEqual(expect.arrayContaining([1, 4, 7, 14, 15, 24, 36, 12, 30, 31, 2025, 432, 433]));
    });

    it('em en usa ponto decimal e rótulos em inglês', () => {
        const built = buildBenchmarksContext(WINDOWS, undefined, 'en');

        expect(built.payload.cdi.acumulado[3]).toEqual({ periodo: '12 months', valor: '14.32%' });
        expect(built.payload.cdi.sem_historico).toEqual(['24 months', '36 months']);
        expect(built.payload.cdi.acumulado.at(-1)).toEqual({ periodo: 'year to date', valor: '14.32%' });
    });

    it('devolve só as janelas pedidas', () => {
        const built = buildBenchmarksContext(WINDOWS, ['m12', 'ytd'], 'pt-BR');

        expect(built.payload.cdi.acumulado).toEqual([
            { periodo: '12 meses', valor: '14,32%' },
            { periodo: 'no ano', valor: '14,32%' }
        ]);
        expect(built.payload.cdi.sem_historico).toEqual([]);
        expect(built.payload.ibovespa.sem_historico).toEqual(['12 meses', 'no ano']);
    });

    it('Ibovespa sem fonte configurada vira status, sem número, e série atrasada vem marcada', () => {
        const built = buildBenchmarksContext(
            {
                ...WINDOWS,
                cdi: { ...WINDOWS.cdi, stale: true },
                selicTarget: { source: 'Banco Central, série 432', lastDate: null, stale: true, bps: null },
                ibovespa: {
                    state: 'not_configured',
                    source: 'brapi',
                    lastDate: null,
                    stale: true,
                    windows: { m1: null, m3: null, m6: null, m12: null, m24: null, m36: null, ytd: null }
                }
            },
            ['m1'],
            'pt-BR'
        );

        expect(built.payload.cdi.atrasado).toBe(true);
        expect(built.payload.selic_meta).toMatchObject({ ate: null, valor: null, atrasado: true });
        expect(built.payload.ibovespa).toEqual({
            fonte: 'brapi',
            ate: null,
            atrasado: true,
            acumulado: [],
            sem_historico: ['1 mês'],
            status: 'nao_configurado'
        });
    });
});
