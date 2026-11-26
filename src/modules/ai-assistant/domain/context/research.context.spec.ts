import { describe, expect, it } from 'vitest';
import type { FixedIncomeComparison } from '../../../market-benchmarks/services/fixed-income-benchmark.service';
import type { FundPerformance } from '../../../market-benchmarks/services/fund-performance.service';
import type { LookupEntry } from '../../../market-benchmarks/services/asset-lookup.service';
import { buildAssetLookupContext, buildFixedIncomeBenchmarkContext, buildFundPerformanceContext } from './research.context';

const STOCK: LookupEntry = {
    externalId: 'PETR4',
    symbol: 'PETR4',
    name: 'Petrobras PN',
    market: 'B3',
    kind: 'stock',
    typeGroup: 'acoes_br',
    suggestedClassKey: 'acoes_br',
    currency: 'BRL',
    quote: { price: '38.5', currency: 'BRL', date: '2026-03-19', stale: false }
};

const FUND: LookupEntry = {
    ...STOCK,
    externalId: '11111111000191',
    symbol: 'ALFA',
    name: 'Fundo Alfa',
    market: 'CVM',
    kind: 'fund',
    suggestedClassKey: null,
    quote: null
};

describe('contexto da pesquisa de ativo', () => {
    it('traz nome, código, tipo, classe, mercado e a cotação com a data; só o fundo leva o fund_id', () => {
        const built = buildAssetLookupContext([STOCK, FUND], 'pt-BR');

        expect(built.payload.ativos[0]).toEqual({
            nome: 'Petrobras PN',
            ticker: 'PETR4',
            tipo: 'Ação',
            classe: 'Ações Brasil',
            mercado: 'B3 (Brasil)',
            cotacao: { valor: 'R$ 38,50', data: '2026-03-19', atrasada: false }
        });
        expect(built.payload.ativos[1]).toMatchObject({
            tipo: 'Fundo',
            classe: null,
            mercado: 'Fundos (CVM)',
            cotacao: null,
            fund_id: '11111111000191'
        });
        expect(built.numbers).toEqual(expect.arrayContaining([3, 19, 39, 2026]));
    });

    it('em inglês usa os rótulos em inglês', () => {
        const built = buildAssetLookupContext([STOCK], 'en');

        expect(built.payload.ativos[0]).toMatchObject({ tipo: 'Stock', classe: 'Brazilian stocks', mercado: 'B3 (Brazil)' });
    });
});

const PERFORMANCE: FundPerformance = {
    state: 'ok',
    name: 'Fundo Alfa',
    lastDate: '2026-03-19',
    stale: false,
    complete: true,
    cdiLastDate: '2026-03-19',
    cdiSource: 'Banco Central, série 12',
    source: 'CVM, informe diário',
    windows: {
        m12: { fundBps: 1500, cdiBps: 1280, differenceBps: 220 },
        m3: { fundBps: 200, cdiBps: 310, differenceBps: -110 },
        m1: { fundBps: 105, cdiBps: 105, differenceBps: 0 },
        m6: { fundBps: 600, cdiBps: null, differenceBps: null }
    },
    missing: ['m36']
};

describe('contexto da rentabilidade do fundo', () => {
    it('mostra fundo, CDI e diferença já calculada, com a situação contra o CDI', () => {
        const built = buildFundPerformanceContext(PERFORMANCE, ['m1', 'm3', 'm6', 'm12', 'm36'], 'pt-BR');

        expect(built.payload).toMatchObject({
            status: 'ok',
            fundo: 'Fundo Alfa',
            ate: '2026-03-19',
            fonte: 'CVM, informe diário',
            historico_completo: true
        });
        expect(built.payload.janelas).toEqual([
            { periodo: '1 mês', fundo: '1,05%', cdi: '1,05%', diferenca: '0 pp', situacao: 'igual_ao_cdi' },
            { periodo: '3 meses', fundo: '2,00%', cdi: '3,10%', diferenca: '-1,1 pp', situacao: 'abaixo_do_cdi' },
            { periodo: '6 meses', fundo: '6,00%', cdi: null, diferenca: null, situacao: null },
            { periodo: '12 meses', fundo: '15,00%', cdi: '12,80%', diferenca: '2,2 pp', situacao: 'acima_do_cdi' }
        ]);
        expect(built.payload.sem_historico).toEqual(['36 meses']);
        expect(built.numbers).toEqual(expect.arrayContaining([1, 2, 3, 6, 12, 15, 36]));
    });

    it('fundo sem dados sai com status próprio e sem janelas', () => {
        const built = buildFundPerformanceContext(
            { ...PERFORMANCE, state: 'no_data', lastDate: null, cdiLastDate: null, windows: {}, missing: ['m1'] },
            ['m1'],
            'pt-BR'
        );

        expect(built.payload).toMatchObject({ status: 'sem_dados', ate: null, janelas: [], sem_historico: ['1 mês'] });
    });
});

const COMPARISON: FixedIncomeComparison = {
    state: 'ok',
    reference: {
        cdi12Bps: 1280,
        cdiLastDate: '2026-03-19',
        cdiSource: 'Banco Central, série 12',
        ipca12Bps: 480,
        ipcaLastDate: '2026-02-01',
        ipcaSource: 'Banco Central, série 433'
    },
    titles: [
        {
            key: 't1',
            kind: 'cdb',
            indexer: 'cdi_percent',
            rateBps: 11000,
            appliedAt: '2025-06-10',
            nominalAnnualBps: 1408,
            realAnnualBps: 880,
            beatsInflation: true,
            versusCdiBps: 128,
            estimated: true
        }
    ]
};

describe('contexto do título contra os indicadores', () => {
    it('traz as taxas, se ganha da inflação e a diferença para o CDI, com a data de cada índice', () => {
        const built = buildFixedIncomeBenchmarkContext(COMPARISON, 'pt-BR');

        expect(built.payload.status).toBe('ok');
        expect(built.payload.cdi_12m).toEqual({ valor: '12,80%', fonte: 'Banco Central, série 12', ate: '2026-03-19' });
        expect(built.payload.ipca_12m).toEqual({ valor: '4,80%', fonte: 'Banco Central, série 433', ate: '2026-02' });
        expect(built.payload.titulos).toEqual([
            {
                chave: 't1',
                tipo: 'cdb',
                indexador: 'percentual do CDI',
                taxa_contratada: '110,00%',
                aplicado_em: '2025-06',
                taxa_nominal_estimada: '14,08%',
                taxa_real_estimada: '8,80%',
                ganha_da_inflacao: true,
                contra_cdi_12m: '1,3 pp',
                situacao_contra_cdi: 'acima',
                estimado: true
            }
        ]);
        expect(built.numbers).toEqual(expect.arrayContaining([12, 13, 5, 110, 14, 9]));
    });

    it('sem título escolhido o estado pede a escolha, e sem índice o estado diz isso', () => {
        const list = buildFixedIncomeBenchmarkContext({ ...COMPARISON, state: 'list' }, 'en');
        const empty = buildFixedIncomeBenchmarkContext({ ...COMPARISON, state: 'no_index', titles: [] }, 'pt-BR');

        expect(list.payload.status).toBe('escolha_um_titulo');
        expect(list.payload.titulos[0]?.indexador).toBe('percentage of the CDI');
        expect(empty.payload).toMatchObject({ status: 'sem_indice', titulos: [] });
    });
});
