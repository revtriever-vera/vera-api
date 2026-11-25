import { CreateOperationData } from '../repositories/investment-operations.repository';
import { affectsPosition } from './average-cost';
import { OperationInput } from './investment-operations.types';
import { operationFingerprint } from './operation-fingerprint';

type Amounts = Pick<
    CreateOperationData,
    'quantity' | 'unitPrice' | 'grossMinor' | 'feesMinor' | 'withheldTaxMinor' | 'currency' | 'fxRate' | 'grossBrlMinor'
>;

function amountsOf(operation: OperationInput): Amounts {
    return {
        quantity: operation.quantity,
        unitPrice: operation.unitPrice,
        grossMinor: operation.grossMinor,
        feesMinor: operation.feesMinor,
        withheldTaxMinor: operation.withheldTaxMinor,
        currency: operation.currency,
        fxRate: operation.fxRate,
        grossBrlMinor: operation.grossBrlMinor
    };
}

export function operationRowOf(importId: string, holderUserId: string | null, operation: OperationInput): CreateOperationData {
    return {
        importId,
        assetId: operation.assetId,
        holderUserId,
        kind: operation.kind,
        incomeKind: operation.incomeKind,
        tradeDate: operation.tradeDate,
        settlementDate: operation.settlementDate,
        lineNumber: operation.lineNumber,
        ...amountsOf(operation),
        dayTrade: operation.dayTrade,
        appliedToPosition: affectsPosition(operation),
        fingerprint: operationFingerprint(holderUserId, operation)
    };
}
