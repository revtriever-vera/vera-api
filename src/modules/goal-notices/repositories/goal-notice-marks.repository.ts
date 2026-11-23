import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { GoalNoticeMark, MAX_MARKS_PER_RUN } from '../domain/goal-notice.types';

@Injectable()
export class GoalNoticeMarksRepository extends TenantRepository<'GoalNoticeMarks'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'GoalNoticeMarks');
    }

    public async listOfMonth(month: string): Promise<GoalNoticeMark[]> {
        return this.findMany({ month }, { limit: MAX_MARKS_PER_RUN });
    }

    public async mark(goalId: string, month: string): Promise<boolean> {
        const row: { id: string } | undefined = await this.insertBuilder()
            .values({ id: IdUtil.newId(), companyId: this.companyId, goalId, month })
            .onConflict((conflict) => conflict.columns(['companyId', 'goalId', 'month']).doNothing())
            .returning('id')
            .executeTakeFirst();
        return row !== undefined;
    }
}
