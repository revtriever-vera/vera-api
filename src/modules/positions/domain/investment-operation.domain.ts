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

    public async listCreatedAfter(assetIds: readonly string[], after: Date): Promise<InvestmentOperation[]> {
        return this.operations.listCreatedAfter(assetIds, after);
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
