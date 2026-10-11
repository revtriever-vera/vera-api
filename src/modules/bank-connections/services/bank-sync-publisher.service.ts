import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { MissingTenantContextError } from '../../../core/database/database.errors';
import { PublishOptions, QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import { DateUtil } from '../../../shared/utils/date.util';
import { BankConnectionsLogService } from './bank-connections-log.service';
import {
    ConnectionIdentity,
    SYNC_ATTEMPTS,
    SYNC_BACKOFF_MS,
    SYNC_TRIGGERS,
    SyncRequestedPayload,
    SyncTrigger
} from '../domain/bank-connections.types';

const HOUR_STAMP_LENGTH: number = 10;
const MINUTE_STAMP_LENGTH: number = 12;
const MILLISECOND_STAMP_LENGTH: number = 17;
const MANUAL_BUCKET_MINUTES: number = 10;
const MINUTE_MS: number = 60_000;

function compactIso(at: Date, length: number): string {
    return at
        .toISOString()
        .replace(/[-T:.Z]/g, '')
        .slice(0, length);
}

export function hourStampOf(at: Date): string {
    return compactIso(at, HOUR_STAMP_LENGTH);
}

export function manualStampOf(at: Date): string {
    const bucket: number = MANUAL_BUCKET_MINUTES * MINUTE_MS;
    return compactIso(new Date(Math.floor(at.getTime() / bucket) * bucket), MINUTE_STAMP_LENGTH);
}

function dayStampOf(at: Date): string {
    return DateUtil.todayInBrazil(at).replace(/-/g, '');
}

function stampOf(trigger: SyncTrigger, at: Date): string {
    if (trigger === SYNC_TRIGGERS.daily) {
        return dayStampOf(at);
    }
    if (trigger === SYNC_TRIGGERS.manual) {
        return manualStampOf(at);
    }
    return trigger === SYNC_TRIGGERS.credentialsRotated ? compactIso(at, MILLISECOND_STAMP_LENGTH) : hourStampOf(at);
}

export function syncJobId(connectionId: string, trigger: SyncTrigger, at: Date): string {
    return `pluggy-sync-${connectionId}-${trigger}-${stampOf(trigger, at)}`;
}

@Injectable()
export class BankSyncPublisherService {
    public constructor(
        private readonly publisher: QueuePublisherPort,
        private readonly context: AppContext,
        private readonly logs: BankConnectionsLogService
    ) {}

    public async publishAll(connectionIds: readonly string[], trigger: SyncTrigger): Promise<void> {
        const companyId: string | undefined = this.context.getOrNull()?.companyId;
        if (companyId === undefined) {
            throw new MissingTenantContextError('BankConnections');
        }
        const now: Date = new Date();
        for (const connectionId of connectionIds) {
            const payload: SyncRequestedPayload = { connectionId, companyId, trigger };
            await this.publishOne(payload, {
                jobId: syncJobId(connectionId, trigger, now),
                replaceExisting: trigger === SYNC_TRIGGERS.manual
            });
        }
    }

    public async publishDaily(connections: readonly ConnectionIdentity[], spacingMs: number): Promise<void> {
        const now: Date = new Date();
        for (const [index, connection] of connections.entries()) {
            const payload: SyncRequestedPayload = {
                connectionId: connection.id,
                companyId: connection.companyId,
                trigger: SYNC_TRIGGERS.daily
            };
            await this.publishOne(payload, {
                jobId: syncJobId(connection.id, SYNC_TRIGGERS.daily, now),
                delayMs: index * spacingMs
            });
        }
    }

    private async publishOne(payload: SyncRequestedPayload, options: PublishOptions): Promise<void> {
        try {
            await this.publisher.publish(QUEUES.bankConnections, MESSAGE_TYPES.bankConnectionsSyncRequested, payload, {
                ...options,
                attempts: SYNC_ATTEMPTS,
                backoffDelayMs: SYNC_BACKOFF_MS
            });
        } catch (error: unknown) {
            this.logs.syncPublishFailed(payload.connectionId, payload.trigger, error);
        }
    }
}
