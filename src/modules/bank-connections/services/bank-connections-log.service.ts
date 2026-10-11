import { Injectable } from '@nestjs/common';
import { LogEntry, LogService } from '../../../core/observability/log.service';
import { CredentialAction, CredentialStatus, ItemOutcome } from '../domain/bank-connections.types';

const CREDENTIALS: string = 'bank-connections-credentials';
const ITEM: string = 'bank-connections-item';
const PROVIDER: string = 'bank-connections-provider';
const SYNC_PUBLISH: string = 'bank-connections-sync-publish';

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
