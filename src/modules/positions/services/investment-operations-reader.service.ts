import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { InvestmentOperationDomain } from '../domain/investment-operation.domain';
import { InvestmentOperation } from '../domain/investment-operations.types';
import { normalizeDecimal } from '../domain/quantity';

export interface OperationRecord {
    readonly assetId: string;
    readonly kind: string;
    readonly tradeDate: string;
    readonly settlementDate: string | null;
    readonly quantity: string;
    readonly grossMinor: number;
    readonly feesMinor: number;
    readonly withheldTaxMinor: number | null;
    readonly currency: string;
    readonly grossBrlMinor: number | null;
    readonly appliedToPosition: boolean;
}

function recordOf(operation: InvestmentOperation): OperationRecord {
    return {
        assetId: operation.assetId,
        kind: operation.kind,
        tradeDate: DateUtil.onlyLocalDateString(operation.tradeDate),
        settlementDate: operation.settlementDate === null ? null : DateUtil.onlyLocalDateString(operation.settlementDate),
        quantity: normalizeDecimal(operation.quantity),
        grossMinor: Number(operation.grossMinor),
        feesMinor: Number(operation.feesMinor),
        withheldTaxMinor: operation.withheldTaxMinor === null ? null : Number(operation.withheldTaxMinor),
        currency: operation.currency,
        grossBrlMinor: operation.grossBrlMinor === null ? null : Number(operation.grossBrlMinor),
        appliedToPosition: operation.appliedToPosition
    };
}

@Injectable()
export class InvestmentOperationsReaderService {
    public constructor(private readonly operations: InvestmentOperationDomain) {}

    public async tradedBetween(from: string, to: string): Promise<OperationRecord[]> {
        const rows: InvestmentOperation[] = await this.operations.listTradedBetween(from, to);
        return rows.map(recordOf);
    }

    public async hasHistory(): Promise<boolean> {
        return this.operations.hasAny();
    }
}
