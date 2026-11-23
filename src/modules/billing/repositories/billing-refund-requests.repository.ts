import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { BillingRefundRequest } from '../domain/billing.types';

@Injectable()
export class BillingRefundRequestsRepository extends BareTenantRepository<'BillingRefundRequests'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'BillingRefundRequests');
    }

    public async recordOnce(subscriptionId: string, requestedAt: Date): Promise<boolean> {
        const row: { id: string } | undefined = await this.insertBuilder()
            .values({ id: IdUtil.newId(), companyId: this.companyId, subscriptionId, requestedAt })
            .onConflict((conflict) => conflict.doNothing())
            .returning('id')
            .executeTakeFirst();
        return row !== undefined;
    }

    public async listOfCompany(): Promise<BillingRefundRequest[]> {
        return this.findMany({}, { limit: 100 });
    }
}
