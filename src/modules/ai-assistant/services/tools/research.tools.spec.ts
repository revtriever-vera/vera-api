import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../../core/context/app-context.port';
import { AssetLookupService } from '../../../market-benchmarks/services/asset-lookup.service';
import { FixedIncomeBenchmarkService } from '../../../market-benchmarks/services/fixed-income-benchmark.service';
import { FundPerformanceService } from '../../../market-benchmarks/services/fund-performance.service';
import { AiContextBuilderService } from '../ai-context-builder.service';
import { AssetLookupTool } from './asset-lookup.tool';
import { FixedIncomeVsBenchmarkTool } from './fixed-income-vs-benchmark.tool';
import { FundPerformanceTool } from './fund-performance.tool';

const CONTEXT = { get: () => ({ requestId: 'r', locale: 'pt-BR' }) } as unknown as AppContext;
const BUILDER = new AiContextBuilderService(CONTEXT);

const REFERENCE = {
    cdi12Bps: 1280,
    cdiLastDate: '2026-03-19',
    cdiSource: 'Banco Central, série 12',
    ipca12Bps: 480,
    ipcaLastDate: '2026-02-01',
    ipcaSource: 'Banco Central, série 433'
};

afterEach(() => {
    vi.useRealTimers();
});

describe('asset_lookup', () => {
    const entry = {
        externalId: '11111111000191',
        symbol: 'ALFA',
        name: 'Fundo Alfa',
        market: 'CVM',
        kind: 'fund',
        typeGroup: 'fundos',
        suggestedClassKey: null,
        currency: 'BRL',
        quote: { price: '1.5', currency: 'BRL', date: '2026-03-19', stale: false }
    };

    it('é de leitura, só do plano da IA, sem dado da conta, e valida a pergunta', async () => {
        const tool = new AssetLookupTool({ lookup: vi.fn() } as unknown as AssetLookupService, BUILDER);

        expect(tool).toMatchObject({ name: 'asset_lookup', kind: 'read', feature: 'ai' });
        expect(tool.description('pt-BR')).toContain('Não usa dados da conta');
        expect(tool.description('en')).toContain('Uses no account data');
        await expect(tool.run({ query: 'a' })).rejects.toThrow();
        await expect(tool.run({ query: 'fundo', extra: 1 })).rejects.toThrow();
    });

    it('devolve os ativos com o fund_id do fundo e a cotação com a data', async () => {
        const lookup = vi.fn().mockResolvedValue([entry]);
        const tool = new AssetLookupTool({ lookup } as unknown as AssetLookupService, BUILDER);

        const output = await tool.run({ query: ' fundo alfa ' });

        expect(lookup).toHaveBeenCalledWith('fundo alfa');
        expect(output.payload).toMatchObject({
            ativos: [{ ticker: 'ALFA', fund_id: '11111111000191', cotacao: { valor: 'R$ 1,50', data: '2026-03-19' } }]
        });
    });

    it('sem resultado devolve o estado, sem inventar ativo', async () => {
        const tool = new AssetLookupTool({ lookup: vi.fn().mockResolvedValue([]) } as unknown as AssetLookupService, BUILDER);

        expect((await tool.run({ query: 'nada aqui' })).payload).toEqual({ status: 'no_match' });
    });
});

describe('fund_performance', () => {
    const performance = {
        state: 'ok',
        name: 'Fundo Alfa',
        lastDate: '2026-03-19',
        stale: false,
        complete: true,
        cdiLastDate: '2026-03-19',
        cdiSource: 'Banco Central, série 12',
        source: 'CVM, informe diário',
        windows: { m12: { fundBps: 1500, cdiBps: 1280, differenceBps: 220 } },
        missing: []
    };

    it('lê até hoje no fuso do Brasil, com as janelas pedidas, e recusa janela que não existe', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-20T12:00:00Z'));
        const performanceOf = vi.fn().mockResolvedValue(performance);
        const tool = new FundPerformanceTool({ performance: performanceOf } as unknown as FundPerformanceService, BUILDER);

        const output = await tool.run({ fundId: 'f1', windows: ['m12'] });

        expect(tool).toMatchObject({ name: 'fund_performance', kind: 'read', feature: 'ai' });
        expect(performanceOf).toHaveBeenCalledWith({ fundKey: 'f1', windows: ['m12'], asOf: '2026-03-20' });
        expect(output.payload).toMatchObject({ janelas: [{ periodo: '12 meses', fundo: '15,00%', cdi: '12,80%', diferenca: '2,2 pp' }] });
        await expect(tool.run({ fundId: 'f1', windows: ['m24'] })).rejects.toThrow();
        await expect(tool.run({ fundId: 'f1', windows: [] })).rejects.toThrow();
    });

    it('sem janelas pede todas as de fundo', async () => {
        const performanceOf = vi.fn().mockResolvedValue({ ...performance, state: 'not_found', windows: {}, name: '' });
        const tool = new FundPerformanceTool({ performance: performanceOf } as unknown as FundPerformanceService, BUILDER);

        const output = await tool.run({ fundId: 'x' });

        expect((performanceOf.mock.calls[0]?.[0] as { windows: string[] }).windows).toEqual(['m1', 'm3', 'm6', 'm12', 'm36']);
        expect(output.payload).toMatchObject({ status: 'fundo_nao_encontrado' });
    });
});

describe('fixed_income_vs_benchmark', () => {
    it('sem chave lista os títulos e com a chave pede a comparação daquele título', async () => {
        const compare = vi.fn().mockResolvedValue({ state: 'list', reference: REFERENCE, titles: [] });
        const tool = new FixedIncomeVsBenchmarkTool({ compare } as unknown as FixedIncomeBenchmarkService, BUILDER);

        const listed = await tool.run({});
        await tool.run({ holdingKey: 't1' });

        expect(tool).toMatchObject({ name: 'fixed_income_vs_benchmark', kind: 'read', feature: 'ai' });
        expect(listed.payload).toMatchObject({ status: 'escolha_um_titulo' });
        expect(compare.mock.calls[0]?.[0]).toMatchObject({ holdingKey: undefined });
        expect(compare.mock.calls[1]?.[0]).toMatchObject({ holdingKey: 't1' });
        await expect(tool.run({ holdingKey: '' })).rejects.toThrow();
        expect(tool.description('pt-BR')).toContain('sem nome de emissor');
    });
});
