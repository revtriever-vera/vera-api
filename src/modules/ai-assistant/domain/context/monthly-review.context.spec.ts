import { describe, expect, it } from 'vitest';
import { guardSummary } from '../summary-guard';
import { ReviewClassLabel, ReviewSource } from './ai-context.types';
import { AiTextRenderer } from './ai-text-renderer';
import { buildMonthlyReviewContext } from './monthly-review.context';

const EQUITY: string = '0199b5b8-1c2d-7000-8000-0000000000a1';
const BONDS: string = '0199b5b8-1c2d-7000-8000-0000000000a2';
const CUSTOM: string = '0199b5b8-1c2d-7000-8000-0000000000a3';
const GONE: string = '0199b5b8-1c2d-7000-8000-0000000000a4';
const SECRET_ISSUER: string = 'Banco do Joao da Silva';

const LABELS: readonly ReviewClassLabel[] = [
    { classId: EQUITY, systemKey: 'acoes_br', displayName: 'Ações Brasil' },
    { classId: BONDS, systemKey: 'rf_pos', displayName: 'Renda fixa pós' },
    { classId: CUSTOM, systemKey: null, displayName: 'Cavalos de corrida' }
];

const REVIEW = {
    month: '2026-10',
    baseCurrency: 'BRL',
    returnPct: 1.234,
    byClass: [
        { classId: EQUITY, startMinor: 5_000_000, endMinor: 6_000_000, returnPct: 3.4 },
        { classId: BONDS, startMinor: 4_000_000, endMinor: 4_000_000, reason: 'fixed_income_flow_unknown' },
        { classId: CUSTOM, startMinor: 0, endMinor: 0, returnPct: -2 },
        { classId: GONE, startMinor: 1, endMinor: 1, returnPct: 9 },
        { classId: null, startMinor: 1, endMinor: 1, returnPct: 9 }
    ],
    benchmarks: {
        cdi: { state: 'ok', returnPct: 0.95, referenceMonth: '2026-10' },
        ipca: { state: 'no_data', returnPct: null, referenceMonth: null },
        ibovespa: { state: 'not_configured', returnPct: null, referenceMonth: null }
    },
    topGainers: [{ assetId: '0199b5b8-1c2d-7000-8000-0000000000b1', symbol: 'ITUB4', variationPct: 8 }],
    topLosers: [{ assetId: '0199b5b8-1c2d-7000-8000-0000000000b2', symbol: 'MGLU3', variationPct: -6.5 }],
    income: { amountMinor: 100_000, source: 'operations' },
    concentration: {
        topIssuers: [
            { key: 'funds', name: null, valueMinor: 9_000_000, shareBps: 5000 },
            { key: '0199b5b8-1c2d-7000-8000-0000000000c1', name: SECRET_ISSUER, valueMinor: 3_200_000, shareBps: 3200 }
        ],
        sectors: [
            { key: 'financial', valueMinor: 1, shareBps: 4500 },
            { key: 'energy', valueMinor: 1, shareBps: 2500 }
        ],
        fgcExposure: { overLimitMinor: 500_000, groups: [{ groupId: 'g1', groupName: SECRET_ISSUER, overMinor: 500_000 }] }
    },
    coverage: { reason: null, message: null, generatedAt: '2026-11-01T08:00:00.000Z' }
};

function variant(overrides: Record<string, unknown>): ReviewSource {
    return { ...REVIEW, ...overrides };
}

describe('contexto do Raio-X do mês', () => {
    it('manda só percentuais, chaves e marcadores: sem valor da carteira, sem nome de emissor, sem ticker', () => {
        const built = buildMonthlyReviewContext(REVIEW, LABELS, 'pt-BR');

        const text: string = JSON.stringify(built.payload);
        ['ITUB4', 'MGLU3', SECRET_ISSUER, 'Cavalos', '6000000', '100000', 'valueMinor', 'startMinor'].forEach((value: string): void => {
            expect(text).not.toContain(value);
        });
        expect(built.payload).toMatchObject({
            mes: '2026-10',
            rentabilidade_pct: '+1,23%',
            sem_rentabilidade_motivo: null,
            indices: { cdi_pct: '+0,95%', ipca_pct: null, ibovespa_pct: null },
            proventos_pct_carteira: '1,00%',
            concentracao: { maior_emissor_pct: '32%', maior_setor_pct: '45%', acima_do_fgc: true }
        });
    });

    it('classe vira chave (a do sistema ou custom_n), sem rentabilidade vira nulo e classe que sumiu ou sem classe fica de fora', () => {
        const built = buildMonthlyReviewContext(REVIEW, LABELS, 'pt-BR');

        expect(built.payload.por_classe).toEqual([
            { chave: 'acoes_br', rotulo_padrao: 'Ações Brasil', rentabilidade_pct: '+3,40%' },
            { chave: 'rf_pos', rotulo_padrao: 'Renda fixa pós', rentabilidade_pct: null },
            { chave: 'custom_1', rentabilidade_pct: '-2,00%' }
        ]);
        expect(built.keys.get('cls:custom_1')).toEqual({ kind: 'cls', name: 'Cavalos de corrida' });
    });

    it('altas e quedas viram marcador de ativo, com o ticker só no mapa que o sistema usa para escrever o nome', () => {
        const built = buildMonthlyReviewContext(REVIEW, LABELS, 'pt-BR');

        expect(built.payload.maiores_altas).toEqual([{ chave: 'custom_1', variacao_pct: '+8,00%' }]);
        expect(built.payload.maiores_quedas).toEqual([{ chave: 'custom_2', variacao_pct: '-6,50%' }]);
        expect(built.keys.get('ativo:custom_1')).toEqual({ kind: 'ativo', name: 'ITUB4' });
        expect(built.keys.get('ativo:custom_2')).toEqual({ kind: 'ativo', name: 'MGLU3' });
    });

    it('sem rentabilidade da carteira manda o motivo e nenhum percentual de rentabilidade; sem provento não manda percentual', () => {
        const built = buildMonthlyReviewContext(
            variant({
                ...REVIEW,
                returnPct: undefined,
                byClass: [{ classId: EQUITY, startMinor: 1, endMinor: 1 }],
                income: { amountMinor: 0, source: 'ledger' },
                coverage: { reason: 'no_operations', message: 'x', generatedAt: '2026-11-01T08:00:00.000Z' }
            }),
            LABELS,
            'pt-BR'
        );

        expect(built.payload.rentabilidade_pct).toBeNull();
        expect(built.payload.sem_rentabilidade_motivo).toBe('no_operations');
        expect(built.payload.por_classe).toEqual([{ chave: 'acoes_br', rotulo_padrao: 'Ações Brasil', rentabilidade_pct: null }]);
        expect(built.payload.proventos_pct_carteira).toBeNull();
    });

    it('sem emissor nomeado nem setor nem FGC, a concentração vem vazia', () => {
        const built = buildMonthlyReviewContext(
            variant({
                ...REVIEW,
                concentration: { topIssuers: [], sectors: [], fgcExposure: { overLimitMinor: 0, groups: [] } },
                topGainers: [],
                topLosers: []
            }),
            LABELS,
            'en'
        );

        expect(built.payload.concentracao).toEqual({ maior_emissor_pct: null, maior_setor_pct: null, acima_do_fgc: false });
        expect(built.payload.maiores_altas).toEqual([]);
        expect(built.payload.rentabilidade_pct).toBe('+1.23%');
    });

    it('o guard aceita o texto com os números do contexto e o ativo pelo marcador, e reprova número inventado e ticker escrito', () => {
        const built = buildMonthlyReviewContext(REVIEW, LABELS, 'pt-BR');
        const renderer: AiTextRenderer = new AiTextRenderer();
        const input = { built, locale: 'pt-BR', renderer } as const;

        const good = guardSummary({
            ...input,
            paragraphs: [
                'A carteira rendeu **+1,23%** em outubro, acima do CDI (+0,95%).',
                '[[ativo:custom_1]] subiu +8,00% e [[cls:acoes_br]] fez +3,40%.'
            ]
        });
        const invented = guardSummary({ ...input, paragraphs: ['A carteira rendeu **+55,00%** em outubro.'] });
        const ticker = guardSummary({ ...input, paragraphs: ['ITUB4 subiu +8,00%.'] });

        expect(good).toEqual({
            ok: true,
            paragraphs: ['A carteira rendeu **+1,23%** em outubro, acima do CDI (+0,95%).', 'ITUB4 subiu +8,00% e Ações Brasil fez +3,40%.']
        });
        expect(invented).toMatchObject({ ok: false, check: 'number' });
        expect(ticker).toMatchObject({ ok: false, check: 'forbidden_term' });
    });
});
