import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';

@Injectable()
export class NoticeSendsRepository extends TenantRepository<'NoticeSends'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'NoticeSends');
    }

    public async claim(userId: string, type: string, key: string): Promise<string | null> {
        const row: { id: string } | undefined = await this.insertBuilder()
            .values({ id: IdUtil.newId(), companyId: this.companyId, userId, type, key })
            .onConflict((conflict) => conflict.columns(['companyId', 'userId', 'type', 'key']).doNothing())
            .returning('id')
            .executeTakeFirst();
        return row?.id ?? null;
    }

    public async release(id: string): Promise<void> {
        await this.hardDeleteWhere({ id }, 1);
    }

    public async removeOfUser(userId: string): Promise<number> {
        return this.hardDeleteWhere({ userId }, 500);
    }
}
