import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { averageWindow, categoryAverage } from './category-average';
import {
    BPS_BASE,
    CATEGORY_KINDS,
    CategoryAverage,
    CategoryInfo,
    CategoryMonthNet,
    FLEXIBILITIES,
    INCOME_MODES,
    MAX_AVAILABLE_MONTHS,
    MonthlySummary,
    SpendingSettingsView,
    SUMMARY_CURRENCY,
    SummaryCategoryRow,
    SummaryFlexibility,
    SummaryInput
} from './spending-summary.types';

type Ledger = ReadonlyMap<string, CategoryMonthNet>;

interface Orphans {
    readonly outflowMinor: number;
    readonly outflowCount: number;
    readonly inflowMinor: number;
}

interface IncomeFigures {
    readonly minor: number;
    readonly fromTransactionsMinor: number;
}

const NO_AVERAGE: CategoryAverage = { averageMinor: null, deltaBps: null, isNew: false };
const EMPTY_FLOW: CategoryMonthNet = { month: '', categoryId: null, netMinor: 0, outflowMinor: 0, outflowCount: 0, transactionCount: 0 };

function ledgerKey(month: string, categoryId: string): string {
    return `${month}|${categoryId}`;
}

function indexNets(nets: readonly CategoryMonthNet[]): Ledger {
    return new Map<string, CategoryMonthNet>(
        nets.map((net: CategoryMonthNet): [string, CategoryMonthNet] => [ledgerKey(net.month, net.categoryId ?? ''), net])
    );
}

function flowOf(ledger: Ledger, month: string, categoryId: string): CategoryMonthNet {
    return ledger.get(ledgerKey(month, categoryId)) ?? EMPTY_FLOW;
}

function negate(value: number): number {
    return 0 - value;
}

function sumOf(values: readonly number[]): number {
    return values.reduce((sum: number, value: number): number => sum + value, 0);
}

function basisPoints(numerator: number, denominator: number): number | null {
    return denominator === 0 ? null : DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(numerator).mul(BPS_BASE).div(denominator));
}

function flexibilityOf(category: CategoryInfo): SummaryFlexibility | null {
    if (category.flexibility === FLEXIBILITIES.fixed) {
        return FLEXIBILITIES.fixed;
    }
    return category.flexibility === FLEXIBILITIES.flexible ? FLEXIBILITIES.flexible : null;
}

function rowOf(category: CategoryInfo, spentMinor: number, transactionCount: number, average: CategoryAverage): SummaryCategoryRow {
    return {
        categoryId: category.id,
        systemKey: category.systemKey,
        name: category.name,
        icon: category.icon,
        flexibility: flexibilityOf(category),
        spentMinor,
        averageMinor: average.averageMinor,
        deltaBps: average.deltaBps,
        isNew: average.isNew,
        transactionCount
    };
}

function expenseRow(category: CategoryInfo, ledger: Ledger, month: string, window: readonly string[]): SummaryCategoryRow | null {
    const current: CategoryMonthNet = flowOf(ledger, month, category.id);
    const spentMinor: number = negate(current.netMinor);
    const history: number[] = window.map((past: string): number => negate(flowOf(ledger, past, category.id).netMinor));
    const average: CategoryAverage = categoryAverage(spentMinor, history);
    const relevant: boolean = spentMinor !== 0 || (average.averageMinor ?? 0) > 0;
    return relevant ? rowOf(category, spentMinor, current.transactionCount, average) : null;
}

function incomeRow(category: CategoryInfo, ledger: Ledger, month: string): SummaryCategoryRow | null {
    const current: CategoryMonthNet = flowOf(ledger, month, category.id);
    return current.netMinor === 0 ? null : rowOf(category, current.netMinor, current.transactionCount, NO_AVERAGE);
}

function sortRows(rows: SummaryCategoryRow[], categories: readonly CategoryInfo[]): SummaryCategoryRow[] {
    const positions: ReadonlyMap<string, number> = new Map<string, number>(
        categories.map((category: CategoryInfo): [string, number] => [category.id, category.position])
    );
    return rows.sort(
        (left: SummaryCategoryRow, right: SummaryCategoryRow): number =>
            right.spentMinor - left.spentMinor || (positions.get(left.categoryId) ?? 0) - (positions.get(right.categoryId) ?? 0)
    );
}

function compact(rows: readonly (SummaryCategoryRow | null)[]): SummaryCategoryRow[] {
    return rows.filter((row: SummaryCategoryRow | null): row is SummaryCategoryRow => row !== null);
}

function ofKind(categories: readonly CategoryInfo[], kind: string): CategoryInfo[] {
    return categories.filter((category: CategoryInfo): boolean => category.kind === kind);
}

function transfersOut(categories: readonly CategoryInfo[], ledger: Ledger, month: string): number {
    return negate(
        sumOf(
            ofKind(categories, CATEGORY_KINDS.transfer).map(
                (category: CategoryInfo): number => flowOf(ledger, month, category.id).outflowMinor
            )
        )
    );
}

function orphansOf(nets: readonly CategoryMonthNet[], month: string, categories: readonly CategoryInfo[]): Orphans {
    const known: ReadonlySet<string> = new Set<string>(categories.map((category: CategoryInfo): string => category.id));
    const orphans: CategoryMonthNet[] = nets.filter(
        (net: CategoryMonthNet): boolean => net.month === month && (net.categoryId === null || !known.has(net.categoryId))
    );
    const outflowMinor: number = negate(sumOf(orphans.map((net: CategoryMonthNet): number => net.outflowMinor)));
    return {
        outflowMinor,
        outflowCount: sumOf(orphans.map((net: CategoryMonthNet): number => net.outflowCount)),
        inflowMinor: sumOf(orphans.map((net: CategoryMonthNet): number => net.netMinor)) + outflowMinor
    };
}

function incomeFigures(incomeRows: readonly SummaryCategoryRow[], settings: SpendingSettingsView): IncomeFigures {
    const fromTransactionsMinor: number = sumOf(incomeRows.map((row: SummaryCategoryRow): number => row.spentMinor));
    const declared: boolean = settings.incomeMode === INCOME_MODES.declared;
    return { minor: declared ? (settings.declaredIncomeMinor ?? 0) : fromTransactionsMinor, fromTransactionsMinor };
}

function spentBy(rows: readonly SummaryCategoryRow[], flexibility: SummaryFlexibility): number {
    return sumOf(rows.filter((row: SummaryCategoryRow): boolean => row.flexibility === flexibility).map((row) => row.spentMinor));
}

interface Figures {
    readonly expenses: SummaryCategoryRow[];
    readonly incomes: SummaryCategoryRow[];
    readonly orphans: Orphans;
    readonly income: IncomeFigures;
    readonly expensesMinor: number;
    readonly savedMinor: number;
    readonly goalMinor: number;
    readonly fixedMinor: number;
}

function goalOf(incomeMinor: number, goalBps: number): number {
    return DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(incomeMinor).mul(goalBps).div(BPS_BASE));
}

function expenseRowsOf(input: SummaryInput, ledger: Ledger, window: readonly string[]): SummaryCategoryRow[] {
    const rows: (SummaryCategoryRow | null)[] = ofKind(input.categories, CATEGORY_KINDS.expense).map((category: CategoryInfo) =>
        expenseRow(category, ledger, input.month, window)
    );
    return sortRows(compact(rows), input.categories);
}

function incomeRowsOf(input: SummaryInput, ledger: Ledger): SummaryCategoryRow[] {
    const rows: (SummaryCategoryRow | null)[] = ofKind(input.categories, CATEGORY_KINDS.income).map((category: CategoryInfo) =>
        incomeRow(category, ledger, input.month)
    );
    return sortRows(compact(rows), input.categories);
}

function figuresOf(input: SummaryInput, ledger: Ledger, window: readonly string[]): Figures {
    const expenses: SummaryCategoryRow[] = expenseRowsOf(input, ledger, window);
    const incomes: SummaryCategoryRow[] = incomeRowsOf(input, ledger);
    const orphans: Orphans = orphansOf(input.nets, input.month, input.categories);
    const income: IncomeFigures = incomeFigures(incomes, input.settings);
    const expensesMinor: number = sumOf(expenses.map((row: SummaryCategoryRow): number => row.spentMinor)) + orphans.outflowMinor;
    return {
        expenses,
        incomes,
        orphans,
        income,
        expensesMinor,
        savedMinor: income.minor - expensesMinor,
        goalMinor: goalOf(income.minor, input.settings.savingsGoalBps),
        fixedMinor: spentBy(expenses, FLEXIBILITIES.fixed)
    };
}

function headerOf(
    input: SummaryInput
): Pick<MonthlySummary, 'month' | 'isPartial' | 'hasData' | 'currency' | 'previousMonth' | 'nextMonth' | 'availableMonths'> {
    return {
        month: input.month,
        isPartial: input.isPartial,
        hasData: input.monthsWithData.length > 0,
        currency: SUMMARY_CURRENCY,
        previousMonth: input.navigation.previousMonth,
        nextMonth: input.navigation.nextMonth,
        availableMonths: [...input.monthsWithData].sort().reverse().slice(0, MAX_AVAILABLE_MONTHS)
    };
}

function uncategorizedOf(orphans: Orphans): Pick<MonthlySummary, 'uncategorizedMinor' | 'uncategorizedCount' | 'uncategorizedInflowMinor'> {
    return {
        uncategorizedMinor: orphans.outflowMinor,
        uncategorizedCount: orphans.outflowCount,
        uncategorizedInflowMinor: orphans.inflowMinor
    };
}

function resultOf(
    input: SummaryInput,
    figures: Figures
): Pick<
    MonthlySummary,
    'income' | 'expensesMinor' | 'savedMinor' | 'savingsRateBps' | 'goal' | 'gapMinor' | 'fixedMinor' | 'fixedShareBps'
> {
    const { income, savedMinor, goalMinor, fixedMinor } = figures;
    return {
        income: { minor: income.minor, mode: input.settings.incomeMode, fromTransactionsMinor: income.fromTransactionsMinor },
        expensesMinor: figures.expensesMinor,
        savedMinor,
        savingsRateBps: basisPoints(savedMinor, income.minor),
        goal: { bps: input.settings.savingsGoalBps, minor: goalMinor },
        gapMinor: Math.max(0, goalMinor - savedMinor),
        fixedMinor,
        fixedShareBps: basisPoints(fixedMinor, income.minor)
    };
}

export function calculateSummary(input: SummaryInput): MonthlySummary {
    const ledger: Ledger = indexNets(input.nets);
    const window: readonly string[] = averageWindow(input.month, input.monthsWithData);
    const figures: Figures = figuresOf(input, ledger, window);
    return {
        ...headerOf(input),
        ...uncategorizedOf(figures.orphans),
        ...resultOf(input, figures),
        flexibleMinor: spentBy(figures.expenses, FLEXIBILITIES.flexible),
        transfersOutMinor: transfersOut(input.categories, ledger, input.month),
        averageMonths: window.length,
        excludedCurrencyCount: input.excludedCurrencyCount,
        categories: figures.expenses,
        incomeCategories: figures.incomes
    };
}
