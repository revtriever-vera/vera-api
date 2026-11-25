import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { MonthlySnapshotEntry, MonthlySnapshotRow, PRUNE_BATCH } from '../domain/portfolio-watch.types';

@Injectable()
export class PortfolioMonthlySnapshotsRepository extends TenantRepository<'PortfolioMonthlySnapshots'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'PortfolioMonthlySnapshots');
    }

    public async replaceMonth(month: string, entries: readonly MonthlySnapshotEntry[]): Promise<void> {
        const companyId: string = this.companyId;
        await this.replaceRows(
            { companyId, month },
            entries.map((entry: MonthlySnapshotEntry) => ({ id: IdUtil.newId(), companyId, month, ...entry }))
        );
    }

    public async pruneBefore(month: string): Promise<number> {
        return this.hardDeleteWhere({ month: { '<': month } }, PRUNE_BATCH);
    }

    public async eraseAll(): Promise<number> {
        return this.hardDeleteWhere({}, PRUNE_BATCH);
    }

    public async listPage(offset: number, limit: number): Promise<MonthlySnapshotRow[]> {
        return this.findMany(
            {},
            {
                limit,
                offset,
                orderBy: [
                    { property: 'month', direction: 'asc' },
                    { property: 'assetId', direction: 'asc' }
                ]
            }
        );
    }
}
