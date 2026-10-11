import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { BankSyncRun } from '../domain/bank-connections.types';

@Injectable()
export class BankSyncRunsRepository extends TenantRepository<'BankSyncRuns'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'BankSyncRuns');
    }

    public async latestByConnections(connectionIds: readonly string[]): Promise<BankSyncRun[]> {
        if (connectionIds.length === 0) {
            return [];
        }
        return this.db
            .selectFrom('BankSyncRuns')
            .selectAll()
            .distinctOn('connectionId')
            .where('companyId', '=', this.companyId)
            .where('deletedAt', 'is', null)
            .where('connectionId', 'in', [...connectionIds])
            .orderBy('connectionId')
            .orderBy('startedAt', 'desc')
            .execute();
    }
}
