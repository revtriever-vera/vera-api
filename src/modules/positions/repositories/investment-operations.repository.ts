import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { DateUtil } from '../../../shared/utils/date.util';
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

    public async countByImports(importIds: readonly string[]): Promise<Map<string, number>> {
        if (importIds.length === 0) {
            return new Map();
        }
        const rows: { importId: string; total: string | number | bigint }[] = await this.selectScoped()
            .select(['importId', (builder) => builder.fn.countAll().as('total')])
            .where('deletedAt', 'is', null)
            .where('importId', 'in', importIds)
            .groupBy('importId')
            .execute();
        return new Map(rows.map((row): [string, number] => [row.importId, Number(row.total)]));
    }

    public async latestTradeDates(assetIds: readonly string[], holderUserId: string | null): Promise<Map<string, string>> {
        if (assetIds.length === 0) {
            return new Map();
        }
        const rows: { assetId: string; latest: string | Date }[] = await this.selectScoped()
            .select(['assetId', (builder) => builder.fn.max('tradeDate').as('latest')])
            .where('deletedAt', 'is', null)
            .where('assetId', 'in', assetIds)
            .where('holderUserId', holderUserId === null ? 'is' : '=', holderUserId)
            .groupBy('assetId')
            .execute();
        return new Map(
            rows.map((row: { assetId: string; latest: string | Date }): [string, string] => [
                row.assetId,
                DateUtil.onlyLocalDateString(new Date(row.latest))
            ])
        );
    }

    public async softDeleteByImport(importId: string): Promise<number> {
        return (await this.updateManyRows({ importId }, { deletedAt: new Date() })).length;
    }

    public async releaseHolder(userId: string): Promise<number> {
        return (await this.updateManyRows({ holderUserId: userId }, { holderUserId: null })).length;
    }
}
