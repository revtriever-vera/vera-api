import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../../core/context/app-context.port';
import { BenchmarkService, BenchmarkWindows } from '../../../market-benchmarks/services/benchmark.service';
import { AiContextBuilderService } from '../ai-context-builder.service';
import { MarketBenchmarksTool } from './market-benchmarks.tool';

const EMPTY = { m1: null, m3: null, m6: null, m12: null, m24: null, m36: null, ytd: null };
const WINDOWS: BenchmarkWindows = {
    asOf: '2026-03-20',
    cdi: { source: 'Banco Central, série 12', lastDate: '2026-03-19', stale: false, windows: { ...EMPTY, m1: 100, ytd: 250 } },
    ipca: { source: 'Banco Central, série 433', lastDate: '2026-02-01', stale: false, windows: { ...EMPTY, m1: 40 } },
    selicTarget: { source: 'Banco Central, série 432', lastDate: '2026-03-19', stale: false, bps: 1375 },
    ibovespa: { state: 'not_configured', source: 'brapi', lastDate: null, stale: true, windows: EMPTY }
};

function build() {
    const windows = vi.fn().mockResolvedValue(WINDOWS);
    const context = { get: () => ({ requestId: 'r', locale: 'pt-BR' }) } as unknown as AppContext;
    const tool = new MarketBenchmarksTool({ windows } as unknown as BenchmarkService, new AiContextBuilderService(context));
    return { tool, windows };
}

describe('MarketBenchmarksTool', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('é de leitura, só do plano da IA, e sem dado da conta', () => {
        const { tool } = build();

        expect(tool.name).toBe('market_benchmarks');
        expect(tool.kind).toBe('read');
        expect(tool.feature).toBe('ai');
        expect(tool.description('pt-BR')).toContain('Não usa dados da conta');
        expect(tool.description('en')).toContain('Uses no account data');
    });

    it('lê os indicadores até hoje no fuso do Brasil e devolve o payload com os números citados', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-20T12:00:00Z'));
        const { tool, windows } = build();

        const output = await tool.run({});

        expect(windows).toHaveBeenCalledWith({ asOf: '2026-03-20' });
        expect(output.payload).toMatchObject({ referencia: '2026-03-20', ibovespa: { status: 'nao_configurado' } });
        expect(output.numbers).toEqual(expect.arrayContaining([1, 3, 20, 2026]));
    });

    it('aceita escolher as janelas e recusa janela que não existe', async () => {
        const { tool } = build();

        const output = await tool.run({ windows: ['ytd'] });

        expect(output.payload).toMatchObject({ cdi: { acumulado: [{ periodo: 'no ano', valor: '2,50%' }] } });
        await expect(tool.run({ windows: ['m99'] })).rejects.toThrow();
        await expect(tool.run({ windows: [] })).rejects.toThrow();
    });
});
