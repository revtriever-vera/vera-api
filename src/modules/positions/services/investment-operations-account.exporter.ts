import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { InvestmentImportDomain } from '../domain/investment-import.domain';
import { InvestmentOperationDomain } from '../domain/investment-operation.domain';
import { InvestmentImport, InvestmentOperation } from '../domain/investment-operations.types';
import { normalizeDecimal } from '../domain/quantity';

export interface InvestmentImportExport {
    readonly id: string;
    readonly source: string;
    readonly fileName: string;
    readonly noteNumbers: readonly string[];
    readonly status: string;
    readonly createdAt: string;
}

export interface InvestmentOperationExport {
    readonly importId: string;
    readonly symbol: string | null;
    readonly holderUserId: string | null;
    readonly kind: string;
    readonly incomeKind: string | null;
    readonly tradeDate: string;
    readonly settlementDate: string | null;
    readonly quantity: string;
    readonly unitPrice: string;
    readonly grossMinor: number;
    readonly feesMinor: number;
    readonly withheldTaxMinor: number | null;
    readonly currency: string;
    readonly fxRate: string | null;
    readonly grossBrlMinor: number | null;
    readonly dayTrade: boolean;
    readonly appliedToPosition: boolean;
}

export interface InvestmentOperationsExport {
    readonly imports: InvestmentImportExport[];
    readonly operations: InvestmentOperationExport[];
}

@Injectable()
export class InvestmentOperationsAccountExporter extends AccountDataExporterPort {
    public readonly area: string = 'investment-operations';

    public constructor(
        private readonly imports: InvestmentImportDomain,
        private readonly operations: InvestmentOperationDomain,
        private readonly catalog: AssetCatalogService
    ) {
        super();
    }

    public async exportAll(): Promise<InvestmentOperationsExport> {
        const imports: InvestmentImport[] = await this.imports.listAll();
        const operations: InvestmentOperation[] = await this.operations.listAll();
        const assets: Asset[] = await this.catalog.findManyByIds(
            operations.map((operation: InvestmentOperation): string => operation.assetId)
        );
        const symbolById: ReadonlyMap<string, string> = new Map(assets.map((asset: Asset): [string, string] => [asset.id, asset.symbol]));
        return {
            imports: imports.map(importExportOf),
            operations: operations.map((operation: InvestmentOperation): InvestmentOperationExport =>
                operationExportOf(operation, symbolById)
            )
        };
    }
}

function importExportOf(record: InvestmentImport): InvestmentImportExport {
    return {
        id: record.id,
        source: record.source,
        fileName: record.fileName,
        noteNumbers: record.noteNumbers,
        status: record.status,
        createdAt: record.createdAt.toISOString()
    };
}

function operationExportOf(operation: InvestmentOperation, symbolById: ReadonlyMap<string, string>): InvestmentOperationExport {
    return {
        importId: operation.importId,
        symbol: symbolById.get(operation.assetId) ?? null,
        holderUserId: operation.holderUserId,
        kind: operation.kind,
        incomeKind: operation.incomeKind,
        tradeDate: DateUtil.onlyLocalDateString(operation.tradeDate),
        settlementDate: operation.settlementDate === null ? null : DateUtil.onlyLocalDateString(operation.settlementDate),
        quantity: normalizeDecimal(operation.quantity),
        unitPrice: normalizeDecimal(operation.unitPrice),
        grossMinor: Number(operation.grossMinor),
        feesMinor: Number(operation.feesMinor),
        withheldTaxMinor: operation.withheldTaxMinor === null ? null : Number(operation.withheldTaxMinor),
        currency: operation.currency,
        fxRate: operation.fxRate === null ? null : normalizeDecimal(operation.fxRate),
        grossBrlMinor: operation.grossBrlMinor === null ? null : Number(operation.grossBrlMinor),
        dayTrade: operation.dayTrade,
        appliedToPosition: operation.appliedToPosition
    };
}
