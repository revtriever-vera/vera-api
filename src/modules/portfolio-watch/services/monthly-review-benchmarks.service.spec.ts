import { describe, expect, it, vi } from 'vitest';
import { BenchmarkService, BenchmarkWindows } from '../../market-benchmarks/services/benchmark.service';
import { MonthlyReviewBenchmarksService } from './monthly-review-benchmarks.service';

function windows(overrides: Partial<BenchmarkWindows>): BenchmarkWindows {
    const empty = { source: 's', lastDate: null, stale: false, windows: { m1: null } };
    return {
        asOf: '2026-10-31',
        cdi: empty,
        ipca: empty,
        selicTarget: {},
        ibovespa: { ...empty, state: 'ok' },
        ...overrides
    } as unknown as BenchmarkWindows;
}

async function read(value: BenchmarkWindows): Promise<Awaited<ReturnType<MonthlyReviewBenchmarksService['of']>>> {
    const benchmarks = { windows: vi.fn().mockResolvedValue(value) } as unknown as BenchmarkService;
    return new MonthlyReviewBenchmarksService(benchmarks).of('2026-10');
}

describe('indicadores do mês na revisão', () => {
    it('pergunta pelo último dia do mês e traduz pontos-base em percentual', async () => {
        const windowsOf = vi.fn().mockResolvedValue(windows({}));
        const benchmarks = { windows: windowsOf } as unknown as BenchmarkService;

        await new MonthlyReviewBenchmarksService(benchmarks).of('2026-10');

        expect(windowsOf).toHaveBeenCalledWith({ asOf: '2026-10-31' });
    });

    it('CDI, IPCA e Ibovespa com leitura entram com o mês de referência', async () => {
        const reading = (m1: number, lastDate: string) => ({ source: 's', lastDate, stale: false, windows: { m1 } });

        const result = await read(
            windows({
                cdi: reading(95, '2026-10-30'),
                ipca: reading(31, '2026-09-01'),
                ibovespa: { ...reading(-120, '2026-10-30'), state: 'ok' }
            } as Partial<BenchmarkWindows>)
        );

        expect(result.cdi).toEqual({ state: 'ok', returnPct: 0.95, referenceMonth: '2026-10' });
        expect(result.ipca).toEqual({ state: 'ok', returnPct: 0.31, referenceMonth: '2026-09' });
        expect(result.ibovespa).toEqual({ state: 'ok', returnPct: -1.2, referenceMonth: '2026-10' });
    });

    it('sem token da brapi o Ibovespa fica não configurado, e série velha ou sem leitura vira sem dados', async () => {
        const result = await read(
            windows({
                cdi: { source: 's', lastDate: '2026-10-01', stale: true, windows: { m1: 90 } },
                ibovespa: { source: 'brapi', lastDate: null, stale: false, windows: { m1: null }, state: 'not_configured' }
            } as Partial<BenchmarkWindows>)
        );

        expect(result.ibovespa).toEqual({ state: 'not_configured', returnPct: null, referenceMonth: null });
        expect(result.cdi).toEqual({ state: 'no_data', returnPct: null, referenceMonth: null });
        expect(result.ipca.state).toBe('no_data');
    });
});
