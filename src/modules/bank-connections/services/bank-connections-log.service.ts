import { Injectable } from '@nestjs/common';
import { LogEntry, LogService } from '../../../core/observability/log.service';
import { CredentialAction, CredentialStatus, ItemOutcome } from '../domain/bank-connections.types';

const CREDENTIALS: string = 'bank-connections-credentials';
const ITEM: string = 'bank-connections-item';
const PROVIDER: string = 'bank-connections-provider';
const SYNC_PUBLISH: string = 'bank-connections-sync-publish';
const SYNC_FANOUT: string = 'bank-connections-sync-fanout';
const SYNC: string = 'bank-connections-sync';

export interface SyncLogFields {
    readonly connectionId: string;
    readonly runId: string;
    readonly trigger: string;
    readonly status: string;
    readonly accounts: number;
    readonly fetched: number;
    readonly inserted: number;
    readonly updated: number;
    readonly duplicates: number;
    readonly skippedPending: number;
    readonly durationMs: number;
    readonly failureCode: string | null;
}

export type ProviderEndpoint = 'auth' | 'item' | 'accounts' | 'transactions';

@Injectable()
export class BankConnectionsLogService {
    public constructor(private readonly logService: LogService) {}

    public credentials(action: CredentialAction, status: CredentialStatus | null): void {
        this.logService.info({ message: 'pluggy credentials changed', identifier: CREDENTIALS, meta: { action, status } });
    }

    public item(connectionId: string | null, outcome: ItemOutcome, providerStatus: string | null): void {
        this.logService.info({ message: 'pluggy item checked', identifier: ITEM, meta: { connectionId, outcome, providerStatus } });
    }

    public syncPublishFailed(connectionId: string, trigger: string, error: unknown): void {
        this.logService.warn({
            message: 'pluggy sync request could not be queued',
            identifier: SYNC_PUBLISH,
            meta: { connectionId, trigger },
            error
        });
    }

    public syncFanout(connections: number): void {
        this.logService.info({ message: 'pluggy daily synchronization queued', identifier: SYNC_FANOUT, meta: { connections } });
    }

    public syncFinished(fields: SyncLogFields): void {
        const entry: LogEntry = { message: 'pluggy synchronization finished', identifier: SYNC, meta: { ...fields } };
        if (fields.status === 'failed') {
            this.logService.warn(entry);
            return;
        }
        this.logService.info(entry);
    }

    public syncSkipped(connectionId: string, reason: string): void {
        this.logService.info({ message: 'pluggy synchronization skipped', identifier: SYNC, meta: { connectionId, reason } });
    }

    public syncCompanyMismatch(connectionId: string): void {
        this.logService.error({
            message: 'pluggy synchronization refused: payload company differs from the connection company',
            identifier: SYNC,
            meta: { connectionId, reason: 'company_mismatch' }
        });
    }

    public syncInvalidPayload(): void {
        this.logService.error({
            message: 'pluggy synchronization payload is invalid',
            identifier: SYNC,
            meta: { reason: 'invalid_payload' }
        });
    }

    public syncAccountFailed(connectionId: string, errorName: string): void {
        this.logService.warn({
            message: 'pluggy account synchronization failed',
            identifier: SYNC,
            meta: { connectionId, reason: 'account_failed', errorName }
        });
    }

    public providerCall(endpoint: ProviderEndpoint, status: number | null, reason: string | null, retryAfterSeconds: number | null): void {
        const entry: LogEntry = {
            message: 'pluggy request finished',
            identifier: PROVIDER,
            meta: { endpoint, status, reason, retryAfterSeconds }
        };
        if (reason === null) {
            this.logService.debug(entry);
            return;
        }
        this.logService.warn(entry);
    }
}
