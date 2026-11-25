import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { OrderBy } from '../../../shared/pagination/pagination.types';
import { InvestmentOperation, MAX_OPERATIONS_PER_IMPORT, NewInvestmentOperation } from '../domain/investment-operations.types';

export type CreateOperationData = Omit<NewInvestmentOperation, 'id' | 'companyId'>;

const ORDER_BY_DAY: readonly OrderBy[] = [
    { property: 'tradeDate', direction: 'asc' },
    { property: 'lineNumber', direction: 'asc' }
];

@Injectable()
export class InvestmentOperationsRepository extends TenantRepository<'InvestmentOperations'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'InvestmentOperations');
    }

    public async insertMany(data: readonly CreateOperationData[]): Promise<InvestmentOperation[]> {
        const rows: NewInvestmentOperation[] = data.map((row: CreateOperationData): NewInvestmentOperation => ({
            id: IdUtil.newId(),
            companyId: this.companyId,
            ...row
        }));
        return this.createManyRows(rows);
    }

    public async findByFingerprints(fingerprints: readonly string[]): Promise<InvestmentOperation[]> {
        if (fingerprints.length === 0) {
            return [];
        }
        return this.findMany({ fingerprint: fingerprints }, { limit: MAX_OPERATIONS_PER_IMPORT });
    }

    public async listByImport(importId: string): Promise<InvestmentOperation[]> {
        return this.findMany({ importId }, { limit: MAX_OPERATIONS_PER_IMPORT, orderBy: ORDER_BY_DAY });
    }

    public async listAll(): Promise<InvestmentOperation[]> {
        return this.findMany({}, { limit: MAX_OPERATIONS_PER_IMPORT, orderBy: ORDER_BY_DAY });
    }

    public async listCreatedAfter(assetIds: readonly string[], after: Date): Promise<InvestmentOperation[]> {
        return this.findMany(
            { assetId: assetIds, createdAt: { '>': after } },
            { limit: MAX_OPERATIONS_PER_IMPORT, orderBy: [{ property: 'createdAt', direction: 'asc' }] }
        );
    }

    public async softDeleteByImport(importId: string): Promise<number> {
        return (await this.updateManyRows({ importId }, { deletedAt: new Date() })).length;
    }

    public async releaseHolder(userId: string): Promise<number> {
        return (await this.updateManyRows({ holderUserId: userId }, { holderUserId: null })).length;
    }
}
