import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { NoticePreference } from '../domain/notices.types';

@Injectable()
export class NoticePreferencesRepository extends TenantRepository<'NoticePreferences'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'NoticePreferences');
    }

    public async set(userId: string, type: string, enabled: boolean): Promise<NoticePreference> {
        return this.upsertRow(
            { id: IdUtil.newId(), companyId: this.companyId, userId, type, enabled },
            { columns: ['companyId', 'userId', 'type'], update: { enabled, updatedAt: new Date() } }
        );
    }

    public async listOfUser(userId: string): Promise<NoticePreference[]> {
        return this.findMany({ userId }, { limit: 200 });
    }

    public async listDisabled(type: string): Promise<NoticePreference[]> {
        return this.findMany({ type, enabled: false }, { limit: 1000 });
    }

    public async listAll(offset: number, limit: number): Promise<NoticePreference[]> {
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
