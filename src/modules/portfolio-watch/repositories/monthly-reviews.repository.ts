import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { MonthlyReviewRow } from '../domain/monthly-review.types';
import { PRUNE_BATCH } from '../domain/portfolio-watch.types';

export const MONTHLY_REVIEWS_LIMIT: number = 120;

@Injectable()
export class MonthlyReviewsRepository extends TenantRepository<'MonthlyReviews'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'MonthlyReviews');
    }

    public async recordIfAbsent(month: string, payload: unknown): Promise<boolean> {
        const row: { id: string } | undefined = await this.insertBuilder()
            .values({ id: IdUtil.newId(), companyId: this.companyId, month, payload: JSON.stringify(payload) })
            .onConflict((conflict) => conflict.columns(['companyId', 'month']).where('deletedAt', 'is', null).doNothing())
            .returning('id')
            .executeTakeFirst();
        return row !== undefined;
    }

    public async findByMonth(month: string): Promise<MonthlyReviewRow | null> {
        return this.findOne({ month });
    }

    public async listRecent(): Promise<MonthlyReviewRow[]> {
        return this.findMany({}, { limit: MONTHLY_REVIEWS_LIMIT, orderBy: [{ property: 'month', direction: 'desc' }] });
    }

    public async eraseAll(): Promise<number> {
        return this.hardDeleteWhere({}, PRUNE_BATCH);
    }
}
