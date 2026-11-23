import { Injectable } from '@nestjs/common';
import { AppContext } from '../../context/app-context.port';
import { DatabaseClient } from '../../database/database.client';
import { BareTenantRepository } from '../../database/repositories/bare-tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { NoticeKind } from '../usage.types';

const ERASE_BATCH: number = 500;

@Injectable()
export class PaidUsageNoticesRepository extends BareTenantRepository<'PaidUsageNotices'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'PaidUsageNotices');
    }

    public async claim(period: string, kind: NoticeKind): Promise<boolean> {
        const claimed: { id: string } | undefined = await this.insertBuilder()
            .values({ id: IdUtil.newId(), companyId: this.companyId, period, kind })
            .onConflict((conflict) => conflict.columns(['companyId', 'period', 'kind']).doNothing())
            .returning('id')
            .executeTakeFirst();
        return claimed !== undefined;
    }

    public async eraseAll(): Promise<number> {
        return this.hardDeleteWhere({}, ERASE_BATCH);
    }
}
