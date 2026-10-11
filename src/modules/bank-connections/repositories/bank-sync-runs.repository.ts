import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import {
    BankSyncRun,
    PRUNE_BATCH,
    SYNC_FAILURE_CODES,
    SYNC_RUN_STATUSES,
    SyncCounts,
    SyncFailureCode,
    SyncRunStatus
} from '../domain/bank-connections.types';

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

    public async begin(connectionId: string, trigger: string): Promise<BankSyncRun> {
        return this.createRow({
            id: IdUtil.newId(),
            companyId: this.companyId,
            connectionId,
            trigger,
            status: SYNC_RUN_STATUSES.running
        });
    }

    public async conclude(
        id: string,
        status: SyncRunStatus,
        counts: SyncCounts,
        failureCode: SyncFailureCode | null
    ): Promise<BankSyncRun | null> {
        return this.updateRow(id, {
            status,
            accounts: counts.accounts,
            fetched: counts.fetched,
            inserted: counts.inserted,
            updated: counts.updated,
            duplicates: counts.duplicates,
            failureCode,
            finishedAt: new Date()
        });
    }

    public async interruptStale(connectionId: string, startedBefore: Date): Promise<BankSyncRun[]> {
        return this.updateManyRows(
            { connectionId, status: SYNC_RUN_STATUSES.running, startedAt: { '<': startedBefore } },
            { status: SYNC_RUN_STATUSES.failed, failureCode: SYNC_FAILURE_CODES.interrupted, finishedAt: new Date() }
        );
    }

    public async findRunningSince(connectionIds: readonly string[], since: Date): Promise<BankSyncRun[]> {
        if (connectionIds.length === 0) {
            return [];
        }
        return this.findMany({ connectionId: [...connectionIds], status: SYNC_RUN_STATUSES.running, startedAt: { '>=': since } });
    }

    public async pruneBeyond(connectionId: string, keep: number): Promise<number> {
        const surplus: { id: string }[] = await this.db
            .selectFrom('BankSyncRuns')
            .select('id')
            .where('companyId', '=', this.companyId)
            .where('connectionId', '=', connectionId)
            .where('deletedAt', 'is', null)
            .orderBy('startedAt', 'desc')
            .offset(keep)
            .limit(PRUNE_BATCH)
            .execute();
        if (surplus.length === 0) {
            return 0;
        }
        return this.hardDeleteWhere({ id: surplus.map((row: { id: string }): string => row.id) }, PRUNE_BATCH);
    }
}
