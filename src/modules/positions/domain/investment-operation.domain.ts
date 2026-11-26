import { Injectable } from '@nestjs/common';
import { CreateOperationData, InvestmentOperationsRepository } from '../repositories/investment-operations.repository';
import { InvestmentOperation } from './investment-operations.types';

@Injectable()
export class InvestmentOperationDomain {
    public constructor(private readonly operations: InvestmentOperationsRepository) {}

    public async insertMany(data: readonly CreateOperationData[]): Promise<InvestmentOperation[]> {
        return this.operations.insertMany(data);
    }

    public async existingFingerprints(fingerprints: readonly string[]): Promise<ReadonlySet<string>> {
        const rows: InvestmentOperation[] = await this.operations.findByFingerprints(fingerprints);
        return new Set(rows.map((row: InvestmentOperation): string => row.fingerprint));
    }

    public async listByImport(importId: string): Promise<InvestmentOperation[]> {
        return this.operations.listByImport(importId);
    }

    public async listAll(): Promise<InvestmentOperation[]> {
        return this.operations.listAll();
    }

    public async listTradedBetween(from: string, to: string): Promise<InvestmentOperation[]> {
        return this.operations.listTradedBetween(from, to);
    }

    public async hasAny(): Promise<boolean> {
        return this.operations.hasAny();
    }

    public async listCreatedAfter(assetIds: readonly string[], after: Date): Promise<InvestmentOperation[]> {
        return this.operations.listCreatedAfter(assetIds, after);
    }

    public async latestTradeDates(assetIds: readonly string[], holderUserId: string | null): Promise<Map<string, string>> {
        return this.operations.latestTradeDates(assetIds, holderUserId);
    }

    public async countByImports(importIds: readonly string[]): Promise<Map<string, number>> {
        return this.operations.countByImports(importIds);
    }

    public async softDeleteByImport(importId: string): Promise<number> {
        return this.operations.softDeleteByImport(importId);
    }

    public async releaseHolder(userId: string): Promise<number> {
        return this.operations.releaseHolder(userId);
    }
}
