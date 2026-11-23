import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { BillingPendingCancellation } from '../domain/billing.types';

@Injectable()
export class BillingPendingCancellationsRepository extends BareGlobalRepository<'BillingPendingCancellations'> {
    public constructor(database: DatabaseClient) {
        super(database, 'BillingPendingCancellations');
    }

    public async recordOnce(engineSubscriptionId: string): Promise<void> {
        await this.insertBuilder()
            .values({ id: IdUtil.newId(), engineSubscriptionId })
            .onConflict((conflict) => conflict.column('engineSubscriptionId').doNothing())
            .execute();
    }

    public async list(limit: number): Promise<BillingPendingCancellation[]> {
        return this.findMany({}, { limit, orderBy: [{ property: 'createdAt', direction: 'asc' }] });
    }

    public async resolve(id: string): Promise<void> {
        await this.hardDeleteWhere({ id }, 1);
    }
}
