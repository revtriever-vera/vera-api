import { INCOME_SOURCES, OPERATION_KIND_NAMES, IncomeResult, ReviewLedgerEntry, ReviewOperation } from './monthly-review.types';
import { incomeByAssetFromLedger, incomeByAssetFromOperations } from './review-flows';

export interface MonthIncome {
    readonly byAsset: ReadonlyMap<string, number>;
    readonly result: IncomeResult;
}

function totalOf(byAsset: ReadonlyMap<string, number>): number {
    return [...byAsset.values()].reduce((total: number, amount: number): number => total + amount, 0);
}

export function monthIncomeOf(
    operations: readonly ReviewOperation[],
    ledger: readonly ReviewLedgerEntry[],
    baseCurrency: string
): MonthIncome {
    const hasOperations: boolean = operations.some((operation: ReviewOperation): boolean => operation.kind === OPERATION_KIND_NAMES.income);
    const byAsset: Map<string, number> = hasOperations
        ? incomeByAssetFromOperations(operations, baseCurrency)
        : incomeByAssetFromLedger(ledger, baseCurrency);
    const source: IncomeResult['source'] = hasOperations ? INCOME_SOURCES.operations : INCOME_SOURCES.ledger;
    return { byAsset, result: { amountMinor: totalOf(byAsset), source } };
}
