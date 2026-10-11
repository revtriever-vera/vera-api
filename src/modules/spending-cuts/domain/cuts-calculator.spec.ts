import { describe, expect, it } from 'vitest';
import type { MonthlySummary } from '../../spending-summary/services/spending-summary.service';
import { calculateCuts, limitMonthOf } from './cuts-calculator';
import { CutsResult, CutSuggestion } from './spending-cuts.types';

type Category = MonthlySummary['categories'][number];

function category(systemKey: string, flexibility: 'fixed' | 'flexible', spentMinor: number, averageMinor: number | null): Category {
    return {
        categoryId: `id-${systemKey}`,
        systemKey,
        name: null,
        icon: 'tag',
        flexibility,
        spentMinor,
        averageMinor,
        deltaBps: null,
        isNew: false,
        transactionCount: 1
    };
}

function summary(overrides: Partial<MonthlySummary> = {}): MonthlySummary {
    return {
        month: '2026-09',
        isPartial: false,
        hasData: true,
        currency: 'BRL',
        previousMonth: '2026-08',
        nextMonth: '2026-10',
        availableMonths: [],
        income: { minor: 2_800_000, mode: 'transactions', fromTransactionsMinor: 2_800_000 },
        expensesMinor: 2_464_000,
        uncategorizedMinor: 80_000,
        uncategorizedCount: 2,
        uncategorizedInflowMinor: 0,
        savedMinor: 336_000,
        savingsRateBps: 1200,
        goal: { bps: 2000, minor: 560_000 },
        gapMinor: 224_000,
        fixedMinor: 1_230_000,
        fixedShareBps: 4393,
        flexibleMinor: 1_154_000,
        transfersOutMinor: 1_200_000,
        averageMonths: 3,
        excludedCurrencyCount: 0,
        categories: [
            category('housing', 'fixed', 770_000, 770_000),
            category('groceries', 'flexible', 290_000, 265_000),
            category('eating_out', 'flexible', 245_000, 175_000),
            category('shopping', 'flexible', 235_000, 160_000),
            category('leisure', 'flexible', 190_000, 140_000),
            category('transport', 'flexible', 130_000, 120_000),
            category('subscriptions', 'flexible', 64_000, 61_000),
            category('empty', 'flexible', 0, 10_000)
        ],
        incomeCategories: [],
        ...overrides
    };
}

function keys(result: CutsResult): (string | null)[] {
    return result.suggestions.map((item: CutSuggestion): string | null => item.systemKey);
}

describe('calculateCuts', () => {
    it('meta gravada: reproduz o protótipo com Compras em primeiro', () => {
        const result: CutsResult = calculateCuts(summary(), undefined);

        expect(result).toMatchObject({
            month: '2026-09',
            limitMonth: '2026-10',
            status: 'cut_suggested',
            goal: { bps: 2000, minor: 560_000, simulated: false },
            gapMinor: 224_000,
            surplusMinor: 0,
            totalCutMinor: 224_000,
            flexibleTotalMinor: 1_154_000,
            excessTotalMinor: 233_000,
            categoriesWithCut: 6,
            uncategorizedMinor: 80_000,
            averageMonths: 3
        });
        expect(keys(result)).toEqual(['shopping', 'eating_out', 'leisure', 'groceries', 'transport', 'subscriptions']);
        expect(result.suggestions[0]).toMatchObject({ excessMinor: 75_000, cutMinor: 72_103, limitMinor: 162_897 });
    });

    it('meta simulada de 35% recalcula o gap e marca simulated', () => {
        const result: CutsResult = calculateCuts(summary(), 3500);

        expect(result).toMatchObject({ status: 'cut_suggested', gapMinor: 644_000, totalCutMinor: 644_000 });
        expect(result.goal).toEqual({ bps: 3500, minor: 980_000, simulated: true });
        expect(keys(result)).toEqual(['shopping', 'eating_out', 'groceries', 'leisure', 'transport', 'subscriptions']);
    });

    it('meta simulada de 60% excede o total flexível e zera os limites', () => {
        const result: CutsResult = calculateCuts(summary(), 6000);

        expect(result).toMatchObject({ status: 'exceeds_flexible', gapMinor: 1_344_000, totalCutMinor: 1_154_000, categoriesWithCut: 6 });
        expect(result.suggestions.every((item: CutSuggestion): boolean => item.limitMinor === 0)).toBe(true);
    });

    it('meta simulada de 10% está batida, com sobra e cortes zero', () => {
        const result: CutsResult = calculateCuts(summary(), 1000);

        expect(result).toMatchObject({ status: 'goal_met', gapMinor: 0, surplusMinor: 56_000, totalCutMinor: 0, categoriesWithCut: 0 });
        expect(result.suggestions).toHaveLength(6);
        expect(result.suggestions.every((item: CutSuggestion): boolean => item.limitMinor === item.spentMinor)).toBe(true);
    });

    it('sem dados e sem renda a lista é vazia', () => {
        const empty: CutsResult = calculateCuts(summary({ hasData: false, categories: [] }), undefined);
        const noIncome: CutsResult = calculateCuts(
            summary({ income: { minor: 0, mode: 'transactions', fromTransactionsMinor: 0 }, gapMinor: 0, goal: { bps: 2000, minor: 0 } }),
            undefined
        );

        expect(empty).toMatchObject({ status: 'no_data', suggestions: [], totalCutMinor: 0 });
        expect(noIncome).toMatchObject({ status: 'no_income', suggestions: [], totalCutMinor: 0 });
    });

    it('com gap e sem categoria flexível com gasto o status excede e a lista é vazia', () => {
        const result: CutsResult = calculateCuts(summary({ categories: [category('housing', 'fixed', 770_000, 770_000)] }), undefined);

        expect(result).toMatchObject({ status: 'exceeds_flexible', suggestions: [], flexibleTotalMinor: 0, totalCutMinor: 0 });
    });

    it('cortes abaixo de R$ 1,00 não entram na contagem da frase', () => {
        const result: CutsResult = calculateCuts(
            summary({
                categories: [category('a', 'flexible', 100_000, 99_950), category('b', 'flexible', 100_000, 50_000)],
                gapMinor: 50_100
            }),
            undefined
        );

        expect(result.suggestions.map((item: CutSuggestion): number => item.cutMinor)).toEqual([50_025, 75]);
        expect(result.categoriesWithCut).toBe(1);
    });

    it('limitMonthOf vira o ano', () => {
        expect(limitMonthOf('2026-12')).toBe('2027-01');
        expect(limitMonthOf('2026-09')).toBe('2026-10');
    });
});
