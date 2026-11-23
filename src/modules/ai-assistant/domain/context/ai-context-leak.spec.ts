import { describe, expect, it } from 'vitest';
import type { ContributionSuggestion } from '../../../contribution/services/contribution-planner.service';
import type { PortfolioSnapshot } from '../../../portfolio/services/portfolio-snapshot.service';
import type { CutsResult } from '../../../spending-cuts/services/spending-cuts.service';
import type { MonthlySummary } from '../../../spending-summary/services/spending-summary.service';
import { cutsContextSchema, monthContextSchema, portfolioContextSchema } from '../../validation/ai-payload.schemas';
import { AiContext, BuiltContext } from './ai-context.types';
import { buildCutsContext } from './cuts.context';
import { buildMonthContext } from './month.context';
import { buildPortfolioContext } from './portfolio.context';

const POISON_CATEGORY: string = 'Pix Maria 11987654321';
const POISON_CLASS: string = 'Fundo da maria@example.test';
const POISON_BANK: string = 'Banco Ficticio Exemplo S.A.';
const POISON_TICKER: string = 'PETR4';
const POISON_DESCRIPTION: string = 'PIX ENVIADO JOAO DA SILVA';
const POISON_ID: string = '0199f3a0-1111-7222-8333-444455556666';
const POISON_ID_OTHER: string = '0199f3a0-aaaa-7bbb-8ccc-ddddeeeeffff';
const POISON_COMPANY: string = 'Empresa Ficticia Ltda';

const POISON: readonly string[] = [
    POISON_CATEGORY,
    POISON_CLASS,
    POISON_BANK,
    POISON_TICKER,
    POISON_DESCRIPTION,
    POISON_ID,
    POISON_ID_OTHER,
    POISON_COMPANY,
    '11987654321',
    'maria@example.test'
];

function row(extra: Record<string, unknown>): Record<string, unknown> {
    return {
        categoryId: POISON_ID,
        icon: 'Home',
        description: POISON_DESCRIPTION,
        institution: POISON_BANK,
        spentMinor: 164_000,
        averageMinor: 150_000,
        deltaBps: 933,
        isNew: false,
        transactionCount: 4,
        flexibility: 'fixed',
        systemKey: null,
        name: null,
        ...extra
    };
}

const SUMMARY: MonthlySummary = {
    month: '2026-10',
    isPartial: false,
    hasData: true,
    currency: 'BRL',
    previousMonth: '2026-09',
    nextMonth: null,
    availableMonths: ['2026-09', '2026-10'],
    income: { minor: 800_000, mode: 'transactions', fromTransactionsMinor: 800_000 },
    expensesMinor: 520_000,
    uncategorizedMinor: 12_000,
    uncategorizedCount: 3,
    uncategorizedInflowMinor: 0,
    savedMinor: 280_000,
    savingsRateBps: 3500,
    goal: { bps: 2000, minor: 160_000 },
    gapMinor: 0,
    fixedMinor: 164_000,
    fixedShareBps: 2050,
    flexibleMinor: 356_000,
    transfersOutMinor: 0,
    averageMonths: 3,
    excludedCurrencyCount: 0,
    categories: [
        row({ systemKey: 'housing' }),
        row({ name: POISON_CATEGORY, flexibility: 'flexible', spentMinor: 40_000, averageMinor: null, deltaBps: null, isNew: true }),
        row({ systemKey: 'eating_out', flexibility: 'flexible', spentMinor: 90_000, deltaBps: -1200 })
    ],
    incomeCategories: []
} as unknown as MonthlySummary;

const CUTS: CutsResult = {
    month: '2026-10',
    limitMonth: '2026-11',
    isPartial: false,
    status: 'cut_suggested',
    goal: { bps: 4000, minor: 320_000, simulated: true },
    incomeMinor: 800_000,
    savedMinor: 280_000,
    savingsRateBps: 3500,
    gapMinor: 40_000,
    surplusMinor: 0,
    totalCutMinor: 40_000,
    flexibleTotalMinor: 130_000,
    excessTotalMinor: 60_000,
    categoriesWithCut: 2,
    uncategorizedMinor: 0,
    averageMonths: 3,
    suggestions: [
        {
            categoryId: POISON_ID,
            systemKey: 'eating_out',
            name: null,
            icon: 'Utensils',
            spentMinor: 90_000,
            averageMinor: 80_000,
            excessMinor: 10_000,
            cutMinor: 25_000,
            limitMinor: 65_000
        },
        {
            categoryId: POISON_ID,
            systemKey: null,
            name: POISON_CATEGORY,
            icon: 'Tag',
            spentMinor: 40_000,
            averageMinor: null,
            excessMinor: 0,
            cutMinor: 15_000,
            limitMinor: 25_000
        }
    ]
};

const SNAPSHOT: PortfolioSnapshot = {
    baseCurrency: 'BRL',
    asOf: '2026-11-22',
    toleranceBps: 500,
    totalMinor: 25_000_000,
    unclassifiedMinor: 0,
    empty: false,
    usdRate: null,
    dollarExposure: { valueMinor: 3_000_000, shareBps: 1200 },
    classes: [
        {
            classId: POISON_ID,
            systemKey: 'rf_pos',
            name: null,
            displayName: 'Renda fixa pós',
            colorKey: 'a',
            sortOrder: 1,
            valueMinor: 10_000_000,
            shareBps: 4000,
            targetBps: 5000,
            deviationBps: -1000,
            status: 'below',
            gapMinor: 0,
            holdingsCount: 2
        },
        {
            classId: POISON_ID_OTHER,
            systemKey: null,
            name: POISON_CLASS,
            displayName: POISON_CLASS,
            colorKey: 'b',
            sortOrder: 2,
            valueMinor: 5_000_000,
            shareBps: 2000,
            targetBps: 2000,
            deviationBps: 0,
            status: 'within',
            gapMinor: 0,
            holdingsCount: 1
        }
    ],
    holdings: [{ symbol: POISON_TICKER, name: POISON_BANK, id: POISON_ID }],
    outsideCount: 1,
    largestDeviation: null,
    quality: { missingQuotes: 0, staleQuotes: 0, estimatedFixedIncome: 0, indexDataMissing: 0, missingRates: 0 },
    orphanHoldings: []
} as unknown as PortfolioSnapshot;

const CONTRIBUTION: ContributionSuggestion = {
    baseCurrency: 'BRL',
    amountMinor: 500_000,
    totalBeforeMinor: 25_000_000,
    totalAfterMinor: 25_500_000,
    warnings: [],
    classes: [
        {
            classId: POISON_ID,
            systemKey: 'rf_pos',
            name: null,
            colorKey: 'a',
            amountMinor: 500_000,
            valueBeforeMinor: 10_000_000,
            shareBeforeBps: 4000,
            shareAfterBps: 4100,
            targetBps: 5000,
            note: null,
            assets: []
        }
    ]
};

function keysOf(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.flatMap(keysOf);
    }
    if (value !== null && typeof value === 'object') {
        return Object.entries(value).flatMap(([key, inner]: [string, unknown]): string[] => [key, ...keysOf(inner)]);
    }
    return [];
}

function expectNoPoison(built: BuiltContext<AiContext>): void {
    const text: string = JSON.stringify(built.payload);
    POISON.forEach((value: string): void => {
        expect(text).not.toContain(value);
    });
    expect(keysOf(built.payload).some((key: string): boolean => /^[0-9a-f]{8}-/.test(key))).toBe(false);
}

describe('contexto enviado ao modelo: lista branca', () => {
    it('mês: nenhum valor envenenado e só chaves do schema estrito', () => {
        const built = buildMonthContext(SUMMARY, 'pt-BR');

        expectNoPoison(built);
        expect(monthContextSchema.safeParse(built.payload).success).toBe(true);
        expect(monthContextSchema.safeParse({ ...built.payload, descricao: 'x' }).success).toBe(false);
    });

    it('mês: categoria própria vira custom_<n>, sem revelar o id, e o nome fica só no mapa de marcadores', () => {
        const built = buildMonthContext(SUMMARY, 'pt-BR');

        expect(built.payload.gastos_por_categoria.map((entry) => entry.chave)).toEqual(['housing', 'custom_1', 'eating_out']);
        expect(built.payload.gastos_por_categoria[1]).not.toHaveProperty('rotulo_padrao');
        expect(built.payload.gastos_por_categoria[0]?.rotulo_padrao).toBe('Moradia');
        expect(built.keys.get('cat:custom_1')?.name).toBe(POISON_CATEGORY);
    });

    it('cortes: nenhum valor envenenado e só chaves do schema estrito', () => {
        const built = buildCutsContext(CUTS, 'pt-BR');

        expect(built).not.toBeNull();
        expectNoPoison(built as BuiltContext<AiContext>);
        expect(cutsContextSchema.safeParse(built?.payload).success).toBe(true);
        expect(built?.payload.status).toBe('possivel');
        expect(cutsContextSchema.safeParse({ ...built?.payload, extra: 1 }).success).toBe(false);
    });

    it('carteira com aporte: nenhum valor envenenado, divisão por chave de classe e só chaves do schema estrito', () => {
        const built = buildPortfolioContext(SNAPSHOT, CONTRIBUTION, 'en');

        expectNoPoison(built);
        expect(portfolioContextSchema.safeParse(built.payload).success).toBe(true);
        expect(built.payload.carteira_pct.map((entry) => entry.chave)).toEqual(['rf_pos', 'custom_1']);
        expect(built.payload.carteira_pct[0]?.rotulo_padrao).toBe('Floating-rate fixed income');
        expect(built.payload.aporte_planejado?.por_classe).toEqual([{ chave: 'rf_pos', valor: 'R$5,000' }]);
        expect(built.keys.get('cls:custom_1')?.name).toBe(POISON_CLASS);
        expect(portfolioContextSchema.safeParse({ ...built.payload, ticker: POISON_TICKER }).success).toBe(false);
    });

    it('carteira sem aporte não traz aporte_planejado', () => {
        const built = buildPortfolioContext(SNAPSHOT, null, 'pt-BR');

        expect(built.payload).not.toHaveProperty('aporte_planejado');
        expect(built.payload.exposicao_dolar_pct).toBe('12%');
        expect(built.payload.tolerancia_pp).toBe('5 pp');
    });
});
