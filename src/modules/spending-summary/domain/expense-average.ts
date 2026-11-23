import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { averageWindow } from './category-average';
import { CATEGORY_KINDS, CategoryInfo, CategoryMonthNet } from './spending-summary.types';

export interface ExpenseAverage {
    readonly months: readonly string[];
    readonly averageMinor: number | null;
}

function expenseOfMonth(month: string, nets: readonly CategoryMonthNet[], categories: readonly CategoryInfo[]): number {
    const expenseIds: ReadonlySet<string> = new Set<string>(
        categories.filter((category: CategoryInfo): boolean => category.kind === CATEGORY_KINDS.expense).map((category) => category.id)
    );
    const known: ReadonlySet<string> = new Set<string>(categories.map((category: CategoryInfo): string => category.id));
    let spent: number = 0;
    for (const net of nets) {
        if (net.month !== month) {
            continue;
        }
        if (net.categoryId !== null && expenseIds.has(net.categoryId)) {
            spent -= net.netMinor;
        } else if (net.categoryId === null || !known.has(net.categoryId)) {
            spent -= net.outflowMinor;
        }
    }
    return spent;
}

/**
 * Média mensal dos gastos (categorias `expense` mais o que ficou sem categoria, como no resumo) dos 3 meses fechados anteriores a
 * `currentMonth`, só com os meses que têm transação. Transferência, fatura e investimento não entram.
 */
export function expenseAverage(
    currentMonth: string,
    monthsWithData: readonly string[],
    nets: readonly CategoryMonthNet[],
    categories: readonly CategoryInfo[]
): ExpenseAverage {
    const months: string[] = [...averageWindow(currentMonth, monthsWithData)].reverse();
    if (months.length === 0) {
        return { months, averageMinor: null };
    }
    const total: number = months.reduce((sum: number, month: string): number => sum + expenseOfMonth(month, nets, categories), 0);
    return { months, averageMinor: DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(total).div(months.length)) };
}
