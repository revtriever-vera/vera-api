import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { SuppressionRow } from '../domain/recurring-series.types';

const SUPPRESSIONS_LIMIT: number = 5000;

@Injectable()
export class RecurringSuppressionsRepository extends TenantRepository<'RecurringSuppressions'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'RecurringSuppressions');
    }

    public async listAll(): Promise<SuppressionRow[]> {
        return this.findMany({}, { limit: SUPPRESSIONS_LIMIT });
    }

    public async insert(seriesId: string, merchantKey: string, typicalAmountMinor: number): Promise<SuppressionRow> {
        return this.createRow({ id: IdUtil.newId(), companyId: this.companyId, seriesId, merchantKey, typicalAmountMinor });
    }

    public async softDeleteBySeries(seriesId: string): Promise<void> {
        await this.updateManyRows({ seriesId }, { deletedAt: new Date() });
    }

    public async softDeleteBySeriesIds(seriesIds: readonly string[]): Promise<void> {
        if (seriesIds.length > 0) {
            await this.updateManyRows({ seriesId: [...seriesIds] }, { deletedAt: new Date() });
        }
    }
}
