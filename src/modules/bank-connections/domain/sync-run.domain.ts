import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { BankSyncRunsRepository } from '../repositories/bank-sync-runs.repository';
import {
    BankSyncRun,
    KEPT_SYNC_RUNS,
    RECENT_RUN_MINUTES,
    STALE_RUN_MINUTES,
    SyncCounts,
    SyncFailureCode,
    SyncRunStatus
} from './bank-connections.types';

@Injectable()
export class SyncRunDomain {
    public constructor(private readonly runs: BankSyncRunsRepository) {}

    public async begin(connectionId: string, trigger: string, now: Date = new Date()): Promise<BankSyncRun> {
        await this.runs.interruptStale(connectionId, DateUtil.addMinutes(now, -STALE_RUN_MINUTES));
        return this.runs.begin(connectionId, trigger);
    }

    public async conclude(id: string, status: SyncRunStatus, counts: SyncCounts, failureCode: SyncFailureCode | null): Promise<void> {
        await this.runs.conclude(id, status, counts, failureCode);
    }

    public async runningConnectionIds(connectionIds: readonly string[], now: Date = new Date()): Promise<Set<string>> {
        const running: BankSyncRun[] = await this.runs.findRunningSince(connectionIds, DateUtil.addMinutes(now, -RECENT_RUN_MINUTES));
        return new Set<string>(running.map((run: BankSyncRun): string => run.connectionId));
    }

    public async prune(connectionId: string): Promise<void> {
        await this.runs.pruneBeyond(connectionId, KEPT_SYNC_RUNS);
    }
}
