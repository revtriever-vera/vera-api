import { InvalidOperationError } from '../domain/positions.errors';
import { INCOME_KINDS, OPERATION_KINDS, OperationInput } from '../domain/investment-operations.types';
import { AVERAGE_PRICE_PATTERN, QUANTITY_PATTERN } from '../domain/positions.types';

const DATE_PATTERN: RegExp = /^\d{4}-\d{2}-\d{2}$/;
const INCOME_VALUES: ReadonlySet<string> = new Set(Object.values(INCOME_KINDS));

function reasonOf(operation: OperationInput): string | null {
    if (!DATE_PATTERN.test(operation.tradeDate)) {
        return 'trade_date';
    }
    if (!QUANTITY_PATTERN.test(operation.quantity) || !AVERAGE_PRICE_PATTERN.test(operation.unitPrice)) {
        return 'amount';
    }
    if (!Number.isSafeInteger(operation.feesMinor) || operation.feesMinor < 0) {
        return 'fees';
    }
    const isIncome: boolean = operation.kind === OPERATION_KINDS.income;
    if (isIncome !== (operation.incomeKind !== null && INCOME_VALUES.has(operation.incomeKind))) {
        return 'income_kind';
    }
    return null;
}

export function assertValidOperations(operations: readonly OperationInput[]): void {
    for (const operation of operations) {
        const reason: string | null = reasonOf(operation);
        if (reason !== null) {
            throw new InvalidOperationError(operation.lineNumber, reason);
        }
    }
}
