import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { MissingTenantContextError } from '../../../core/database/database.errors';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import { SyncRequestedPayload, SyncTrigger } from '../domain/bank-connections.types';

const HOUR_STAMP_LENGTH: number = 10;

export function hourStampOf(at: Date): string {
    return at.toISOString().replace(/[-T:]/g, '').slice(0, HOUR_STAMP_LENGTH);
}

export function syncJobId(connectionId: string, trigger: SyncTrigger, at: Date): string {
    return `pluggy-sync-${connectionId}-${trigger}-${hourStampOf(at)}`;
}

@Injectable()
export class BankSyncPublisherService {
    public constructor(
        private readonly publisher: QueuePublisherPort,
        private readonly context: AppContext
    ) {}

    public async publishAll(connectionIds: readonly string[], trigger: SyncTrigger): Promise<void> {
        const companyId: string | undefined = this.context.getOrNull()?.companyId;
        if (companyId === undefined) {
            throw new MissingTenantContextError('BankConnections');
        }
        const now: Date = new Date();
        for (const connectionId of connectionIds) {
            const payload: SyncRequestedPayload = { connectionId, companyId, trigger };
            await this.publisher.publish(QUEUES.bankConnections, MESSAGE_TYPES.bankConnectionsSyncRequested, payload, {
                jobId: syncJobId(connectionId, trigger, now)
            });
        }
    }
}
