import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { PREFS_LIMIT, RecurringNoticePref } from '../domain/recurring-notices.types';

@Injectable()
export class RecurringNoticePrefsRepository extends TenantRepository<'RecurringNoticePrefs'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'RecurringNoticePrefs');
    }

    public async set(userId: string, seriesId: string, enabled: boolean): Promise<RecurringNoticePref> {
        return this.upsertRow(
            { id: IdUtil.newId(), companyId: this.companyId, userId, seriesId, enabled },
            { columns: ['companyId', 'userId', 'seriesId'], update: { enabled, updatedAt: new Date() } }
        );
    }

    public async findOfUser(userId: string, seriesId: string): Promise<RecurringNoticePref | null> {
        return this.findOne({ userId, seriesId });
    }

    public async listEnabledOfUser(userId: string): Promise<RecurringNoticePref[]> {
        return this.findMany({ userId, enabled: true }, { limit: PREFS_LIMIT });
    }

    public async listEnabled(): Promise<RecurringNoticePref[]> {
        return this.findMany({ enabled: true }, { limit: PREFS_LIMIT });
    }

    public async listAll(offset: number, limit: number): Promise<RecurringNoticePref[]> {
        return this.findMany(
            {},
            {
                limit,
                offset,
                orderBy: [
                    { property: 'createdAt', direction: 'asc' },
                    { property: 'id', direction: 'asc' }
                ]
            }
        );
    }

    public async removeOfUser(userId: string): Promise<number> {
        return this.hardDeleteWhere({ userId }, 500);
    }
}
