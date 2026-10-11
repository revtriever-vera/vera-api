import { describe, expect, it } from 'vitest';
import { calculateSummary } from './summary-calculator';
import {
    CategoryInfo,
    CategoryMonthNet,
    MonthlySummary,
    SpendingSettingsView,
    SummaryCategoryRow,
    SummaryInput
} from './spending-summary.types';

const SETTINGS: SpendingSettingsView = { savingsGoalBps: 2000, incomeMode: 'transactions', declaredIncomeMinor: null };
const CLOSED_MONTHS: readonly string[] = ['2026-06', '2026-07', '2026-08', '2026-09'];

function category(position: number, systemKey: string, kind: string, flexibility: string | null): CategoryInfo {
    return { id: `id-${systemKey}`, systemKey, name: null, icon: 'Home', kind, flexibility, position };
}

const CATEGORIES: CategoryInfo[] = [
    category(1, 'housing', 'expense', 'fixed'),
    category(2, 'education', 'expense', 'fixed'),
    category(3, 'health', 'expense', 'fixed'),
    category(6, 'groceries', 'expense', 'flexible'),
    category(7, 'eating_out', 'expense', 'flexible'),
    category(8, 'transport', 'expense', 'flexible'),
    category(9, 'leisure', 'expense', 'flexible'),
    category(10, 'subscriptions', 'expense', 'flexible'),
    category(11, 'shopping', 'expense', 'flexible'),
    category(13, 'income', 'income', null),
    category(15, 'own_transfer', 'transfer', null),
    category(16, 'card_payment', 'transfer', null),
    category(17, 'investments', 'transfer', null)
];

const HISTORY: Record<string, number> = {
    housing: 770000,
    education: 320000,
    health: 138000,
    groceries: 265000,
    eating_out: 175000,
    transport: 120000,
    leisure: 140000,
    subscriptions: 61000,
    shopping: 160000
};

const SEPTEMBER: Record<string, number> = {
    housing: 770000,
    education: 320000,
    health: 140000,
    groceries: 290000,
    eating_out: 245000,
    transport: 130000,
    leisure: 190000,
    subscriptions: 64000,
    shopping: 235000
};

function net(month: string, systemKey: string | null, netMinor: number, outflowMinor: number, count: number = 1): CategoryMonthNet {
    return {
        month,
        categoryId: systemKey === null ? null : `id-${systemKey}`,
        netMinor,
        outflowMinor,
        outflowCount: outflowMinor < 0 ? count : 0,
        transactionCount: count
    };
}

function monthNets(month: string, spent: Record<string, number>): CategoryMonthNet[] {
    const expenses: CategoryMonthNet[] = Object.entries(spent).map(([key, value]: [string, number]) => net(month, key, -value, -value, 2));
    return [
        ...expenses,
        net(month, 'income', 2800000, 0),
        net(month, 'card_payment', 0, -900000, 2),
        net(month, 'investments', -200000, -200000),
        net(month, 'own_transfer', 0, -100000, 2)
    ];
}

function canonicalNets(): CategoryMonthNet[] {
    return [
        ...['2026-06', '2026-07', '2026-08'].flatMap((month: string) => monthNets(month, HISTORY)),
        ...monthNets('2026-09', SEPTEMBER),
        net('2026-09', null, -80000, -80000, 2)
    ];
}

function input(overrides: Partial<SummaryInput> = {}): SummaryInput {
    return {
        month: '2026-09',
        isPartial: false,
        nets: canonicalNets(),
        monthsWithData: CLOSED_MONTHS,
        categories: CATEGORIES,
        settings: SETTINGS,
        excludedCurrencyCount: 0,
        navigation: { previousMonth: '2026-08', nextMonth: '2026-10' },
        ...overrides
    };
}

function rowOf(summary: MonthlySummary, systemKey: string): SummaryCategoryRow {
    return summary.categories.find((row: SummaryCategoryRow): boolean => row.systemKey === systemKey) as SummaryCategoryRow;
}

describe('calculateSummary com o conjunto canônico de setembro', () => {
    const summary: MonthlySummary = calculateSummary(input());

    it('renda, gastos, sem categoria, guardado e taxa', () => {
        expect(summary.income).toEqual({ minor: 2800000, mode: 'transactions', fromTransactionsMinor: 2800000 });
        expect(summary.expensesMinor).toBe(2464000);
        expect(summary.uncategorizedMinor).toBe(80000);
        expect(summary.uncategorizedCount).toBe(2);
        expect(summary.uncategorizedInflowMinor).toBe(0);
        expect(summary.savedMinor).toBe(336000);
        expect(summary.savingsRateBps).toBe(1200);
    });

    it('meta de 20% e quanto falta', () => {
        expect(summary.goal).toEqual({ bps: 2000, minor: 560000 });
        expect(summary.gapMinor).toBe(224000);
    });

    it('fixos, flexíveis e transferências fora', () => {
        expect(summary.fixedMinor).toBe(1230000);
        expect(summary.fixedShareBps).toBe(4393);
        expect(summary.flexibleMinor).toBe(1154000);
        expect(summary.transfersOutMinor).toBe(1200000);
    });

    it('os selos de variação do protótipo', () => {
        expect(rowOf(summary, 'eating_out')).toMatchObject({ spentMinor: 245000, averageMinor: 175000, deltaBps: 4000 });
        expect(rowOf(summary, 'shopping')).toMatchObject({ deltaBps: 4688 });
        expect(rowOf(summary, 'leisure')).toMatchObject({ deltaBps: 3571 });
        expect(rowOf(summary, 'housing')).toMatchObject({ spentMinor: 770000, averageMinor: 770000, deltaBps: 0 });
        expect(summary.averageMonths).toBe(3);
    });

    it('ordena por gasto decrescente', () => {
        expect(summary.categories.map((row: SummaryCategoryRow): string | null => row.systemKey)).toEqual([
            'housing',
            'education',
            'groceries',
            'eating_out',
            'shopping',
            'leisure',
            'health',
            'transport',
            'subscriptions'
        ]);
    });

    it('lista a renda por categoria sem média e os metadados do mês', () => {
        expect(summary.incomeCategories).toHaveLength(1);
        expect(summary.incomeCategories[0]).toMatchObject({ systemKey: 'income', spentMinor: 2800000, averageMinor: null, deltaBps: null });
        expect(summary).toMatchObject({
            month: '2026-09',
            isPartial: false,
            hasData: true,
            currency: 'BRL',
            previousMonth: '2026-08',
            nextMonth: '2026-10',
            availableMonths: ['2026-09', '2026-08', '2026-07', '2026-06'],
            excludedCurrencyCount: 0
        });
    });
});

describe('calculateSummary, regras', () => {
    it('empate de gasto desempata pela posição', () => {
        const nets: CategoryMonthNet[] = [net('2026-09', 'leisure', -1000, -1000), net('2026-09', 'transport', -1000, -1000)];

        const summary: MonthlySummary = calculateSummary(input({ nets, monthsWithData: ['2026-09'] }));

        expect(summary.categories.map((row: SummaryCategoryRow): string | null => row.systemKey)).toEqual(['transport', 'leisure']);
    });

    it('categoria sem gasto no mês mas com média aparece com gasto zero', () => {
        const nets: CategoryMonthNet[] = [net('2026-08', 'leisure', -5000, -5000)];

        const summary: MonthlySummary = calculateSummary(input({ nets, monthsWithData: ['2026-08', '2026-09'] }));

        expect(summary.categories).toHaveLength(1);
        expect(rowOf(summary, 'leisure')).toMatchObject({ spentMinor: 0, averageMinor: 5000, deltaBps: -10000 });
    });

    it('o estorno abate o gasto e pode deixá-lo negativo', () => {
        const nets: CategoryMonthNet[] = [net('2026-09', 'shopping', 3000, 0)];

        const summary: MonthlySummary = calculateSummary(input({ nets, monthsWithData: ['2026-09'] }));

        expect(rowOf(summary, 'shopping').spentMinor).toBe(-3000);
        expect(summary.expensesMinor).toBe(-3000);
    });

    it('entrada sem categoria não é renda nem gasto, e aparece à parte', () => {
        const nets: CategoryMonthNet[] = [net('2026-09', null, 40000, 0, 1), net('2026-09', null, 0, 0, 0)];

        const summary: MonthlySummary = calculateSummary(input({ nets: [nets[0] as CategoryMonthNet], monthsWithData: ['2026-09'] }));

        expect(summary.uncategorizedMinor).toBe(0);
        expect(summary.uncategorizedInflowMinor).toBe(40000);
        expect(summary.income.minor).toBe(0);
        expect(summary.expensesMinor).toBe(0);
    });

    it('misto sem categoria: a saída entra nos gastos e a entrada fica à parte', () => {
        const mixed: CategoryMonthNet = {
            month: '2026-09',
            categoryId: null,
            netMinor: -30000,
            outflowMinor: -50000,
            outflowCount: 1,
            transactionCount: 2
        };

        const summary: MonthlySummary = calculateSummary(input({ nets: [mixed], monthsWithData: ['2026-09'] }));

        expect(summary.uncategorizedMinor).toBe(50000);
        expect(summary.uncategorizedCount).toBe(1);
        expect(summary.uncategorizedInflowMinor).toBe(20000);
    });

    it('categoria desconhecida conta como sem categoria', () => {
        const stray: CategoryMonthNet = { ...net('2026-09', null, -7000, -7000), categoryId: 'id-removida' };

        const summary: MonthlySummary = calculateSummary(input({ nets: [stray], monthsWithData: ['2026-09'] }));

        expect(summary.uncategorizedMinor).toBe(7000);
    });

    it('modo declarado usa o valor declarado e guarda a renda das transações', () => {
        const settings: SpendingSettingsView = { savingsGoalBps: 2500, incomeMode: 'declared', declaredIncomeMinor: 4000000 };

        const summary: MonthlySummary = calculateSummary(input({ settings }));

        expect(summary.income).toEqual({ minor: 4000000, mode: 'declared', fromTransactionsMinor: 2800000 });
        expect(summary.savedMinor).toBe(1536000);
        expect(summary.goal.minor).toBe(1000000);
        expect(summary.gapMinor).toBe(0);
    });

    it('a meta muda o resultado na hora', () => {
        const summary: MonthlySummary = calculateSummary(input({ settings: { ...SETTINGS, savingsGoalBps: 3500 } }));

        expect(summary.goal.minor).toBe(980000);
        expect(summary.gapMinor).toBe(644000);
    });

    it('trocar Mercado para fixo move o valor entre fixos e flexíveis', () => {
        const categories: CategoryInfo[] = CATEGORIES.map((item: CategoryInfo): CategoryInfo =>
            item.systemKey === 'groceries' ? { ...item, flexibility: 'fixed' } : item
        );

        const summary: MonthlySummary = calculateSummary(input({ categories }));

        expect(summary.fixedMinor).toBe(1520000);
        expect(summary.flexibleMinor).toBe(864000);
    });

    it('renda zero deixa taxa e participação nulas e guardado negativo', () => {
        const nets: CategoryMonthNet[] = [net('2026-09', 'leisure', -10000, -10000)];

        const summary: MonthlySummary = calculateSummary(input({ nets, monthsWithData: ['2026-09'] }));

        expect(summary.savingsRateBps).toBeNull();
        expect(summary.fixedShareBps).toBeNull();
        expect(summary.savedMinor).toBe(-10000);
        expect(summary.goal.minor).toBe(0);
        expect(summary.gapMinor).toBe(10000);
    });

    it('a taxa de economia arredonda meio para cima', () => {
        const nets: CategoryMonthNet[] = [net('2026-09', 'income', 20000, 0), net('2026-09', 'leisure', -19997, -19997)];

        const summary: MonthlySummary = calculateSummary(input({ nets, monthsWithData: ['2026-09'] }));

        expect(summary.savedMinor).toBe(3);
        expect(summary.savingsRateBps).toBe(2);
    });

    it('sem nenhuma transação devolve a estrutura zerada', () => {
        const summary: MonthlySummary = calculateSummary(input({ nets: [], monthsWithData: [] }));

        expect(summary).toMatchObject({ hasData: false, expensesMinor: 0, savedMinor: 0, averageMonths: 0, availableMonths: [] });
        expect(summary.categories).toEqual([]);
        expect(summary.incomeCategories).toEqual([]);
    });

    it('limita os meses disponíveis a 24', () => {
        const months: string[] = Array.from(
            { length: 30 },
            (_: unknown, index: number): string => `2024-${String((index % 12) + 1).padStart(2, '0')}`
        );
        const unique: string[] = [...new Set<string>(months)];
        const many: string[] = [
            ...unique,
            ...Array.from({ length: 20 }, (_: unknown, index: number): string => `2025-${String((index % 12) + 1).padStart(2, '0')}`)
        ];

        const summary: MonthlySummary = calculateSummary(input({ monthsWithData: [...new Set<string>(many)] }));

        expect(summary.availableMonths.length).toBeLessThanOrEqual(24);
        expect(summary.availableMonths[0]).toBe('2025-12');
    });

    it('mês parcial sem histórico: média nula e categoria sem selo', () => {
        const nets: CategoryMonthNet[] = [net('2026-10', 'transport', -1840, -1840), net('2026-10', 'subscriptions', -5590, -5590)];

        const summary: MonthlySummary = calculateSummary(
            input({
                month: '2026-10',
                isPartial: true,
                nets,
                monthsWithData: ['2026-10'],
                navigation: { previousMonth: '2026-09', nextMonth: null }
            })
        );

        expect(summary).toMatchObject({ isPartial: true, expensesMinor: 7430, averageMonths: 0, nextMonth: null });
        expect(rowOf(summary, 'subscriptions')).toMatchObject({ spentMinor: 5590, averageMinor: null, deltaBps: null, isNew: false });
    });
});
