import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { NotificationKind } from '../domain/billing.types';

@Injectable()
export class BillingNotificationsRepository extends BareTenantRepository<'BillingNotifications'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'BillingNotifications');
    }

    public async recordOnce(subjectId: string, kind: NotificationKind): Promise<boolean> {
        const row: { id: string } | undefined = await this.insertBuilder()
            .values({ id: IdUtil.newId(), companyId: this.companyId, subjectId, kind })
            .onConflict((conflict) => conflict.doNothing())
            .returning('id')
            .executeTakeFirst();
        return row !== undefined;
    }
}
