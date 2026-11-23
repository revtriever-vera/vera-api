import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { MAX_NOTIFICATION_ATTEMPTS, NOTIFICATION_STATUSES, PremiumEndedNotification } from '../domain/plans.types';

@Injectable()
export class PremiumEndedNotificationsRepository extends BareTenantRepository<'PremiumEndedNotifications'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'PremiumEndedNotifications');
    }

    public async record(handler: string, contractEndsAt: Date): Promise<PremiumEndedNotification> {
        await this.insertBuilder()
            .values({ id: IdUtil.newId(), companyId: this.companyId, handler, contractEndsAt, status: NOTIFICATION_STATUSES.pending })
            .onConflict((conflict) => conflict.columns(['companyId', 'handler', 'contractEndsAt']).doNothing())
            .execute();
        return this.findOneOrThrow(handler, contractEndsAt);
    }

    public async markDone(id: string): Promise<void> {
        await this.updateRow(id, { status: NOTIFICATION_STATUSES.done, lastError: null, updatedAt: new Date() });
    }

    public async markFailed(notification: PremiumEndedNotification, errorName: string): Promise<void> {
        await this.updateRow(notification.id, {
            status: NOTIFICATION_STATUSES.failed,
            attempts: notification.attempts + 1,
            lastError: errorName,
            updatedAt: new Date()
        });
    }

    public async listOpenAcrossTenants(limit: number): Promise<PremiumEndedNotification[]> {
        return this.selectSkipConstraint()
            .selectAll()
            .where('status', '<>', NOTIFICATION_STATUSES.done)
            .where('attempts', '<', MAX_NOTIFICATION_ATTEMPTS)
            .orderBy('createdAt')
            .limit(limit)
            .execute();
    }

    private async findOneOrThrow(handler: string, contractEndsAt: Date): Promise<PremiumEndedNotification> {
        const row: PremiumEndedNotification | null = await this.findOne({ handler, contractEndsAt });
        if (row === null) {
            throw new Error('premium ended notification was not recorded');
        }
        return row;
    }
}
