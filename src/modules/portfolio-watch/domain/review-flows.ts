import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { OPERATION_KIND_NAMES, ReviewLedgerEntry, ReviewOperation } from './monthly-review.types';

const BASE_WITH_CONVERSION: string = 'BRL';

export function inBase(operation: ReviewOperation, minor: number, base: string): number | null {
    if (operation.currency === base) {
        return minor;
    }
    if (base !== BASE_WITH_CONVERSION || operation.grossBrlMinor === null || operation.grossMinor === 0) {
        return null;
    }
    return DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(minor).mul(operation.grossBrlMinor).div(operation.grossMinor));
}

export function cashFlowOf(operation: ReviewOperation, base: string): number | null {
    const gross: number | null = inBase(operation, operation.grossMinor, base);
    const fees: number | null = inBase(operation, operation.feesMinor, base);
    if (gross === null || fees === null) {
        return null;
    }
    return operation.kind === OPERATION_KIND_NAMES.buy ? gross + fees : -(gross - fees);
}

export function incomeOf(operation: ReviewOperation, base: string): number | null {
    const gross: number | null = inBase(operation, operation.grossMinor, base);
    const withheld: number | null = inBase(operation, operation.withheldTaxMinor ?? 0, base);
    return gross === null || withheld === null ? null : gross - withheld;
}

export function isCashFlow(operation: ReviewOperation): boolean {
    return operation.appliedToPosition && (operation.kind === OPERATION_KIND_NAMES.buy || operation.kind === OPERATION_KIND_NAMES.sell);
}

export function incomeByAssetFromOperations(operations: readonly ReviewOperation[], base: string): Map<string, number> {
    const totals: Map<string, number> = new Map();
    for (const operation of operations) {
        const amount: number | null = operation.kind === OPERATION_KIND_NAMES.income ? incomeOf(operation, base) : null;
        if (amount !== null) {
            totals.set(operation.assetId, (totals.get(operation.assetId) ?? 0) + amount);
        }
    }
    return totals;
}

export function incomeByAssetFromLedger(entries: readonly ReviewLedgerEntry[], base: string): Map<string, number> {
    const totals: Map<string, number> = new Map();
    for (const entry of entries) {
        if (entry.currency === base) {
            totals.set(entry.assetId, (totals.get(entry.assetId) ?? 0) + entry.amountMinor);
        }
    }
    return totals;
}
