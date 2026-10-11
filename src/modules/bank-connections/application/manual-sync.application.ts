import { Injectable } from '@nestjs/common';
import { BankConnectionDomain } from '../domain/bank-connection.domain';
import {
    CredentialsMissingError,
    InvalidPluggyCredentialsError,
    ItemNotFoundError,
    SyncInProgressError,
    SyncQueueUnavailableError
} from '../domain/bank-connections.errors';
import {
    BankConnection,
    CONNECTION_STATUSES,
    CREDENTIAL_STATUSES,
    PluggyCredential,
    STATUS_REASONS,
    SYNC_TRIGGERS,
    SYNCABLE_CONNECTION_STATUSES
} from '../domain/bank-connections.types';
import { SyncRunDomain } from '../domain/sync-run.domain';
import { BankSyncPublisherService } from '../services/bank-sync-publisher.service';
import { CredentialsVaultService } from '../services/credentials-vault.service';

function isSyncable(connection: BankConnection): boolean {
    return SYNCABLE_CONNECTION_STATUSES.some((status: string): boolean => status === connection.status);
}

@Injectable()
export class ManualSyncApplication {
    public constructor(
        private readonly vault: CredentialsVaultService,
        private readonly connections: BankConnectionDomain,
        private readonly runs: SyncRunDomain,
        private readonly publisher: BankSyncPublisherService
    ) {}

    public async syncOne(id: string): Promise<{ queued: true }> {
        const connection: BankConnection = await this.connections.require(id);
        if (connection.status === CONNECTION_STATUSES.revoked) {
            throw new ItemNotFoundError(id);
        }
        await this.assertCredentials();
        this.assertSyncable(connection);
        if ((await this.runs.runningConnectionIds([id])).has(id)) {
            throw new SyncInProgressError(id);
        }
        if ((await this.publisher.publishAll([id], SYNC_TRIGGERS.manual)) === 0) {
            throw new SyncQueueUnavailableError();
        }
        return { queued: true };
    }

    public async syncAll(): Promise<{ queued: number }> {
        await this.assertCredentials();
        const syncable: BankConnection[] = await this.connections.listSyncable();
        const running: Set<string> = await this.runs.runningConnectionIds(
            syncable.map((connection: BankConnection): string => connection.id)
        );
        const ids: string[] = syncable
            .map((connection: BankConnection): string => connection.id)
            .filter((id: string): boolean => !running.has(id));
        const queued: number = await this.publisher.publishAll(ids, SYNC_TRIGGERS.manual);
        if (ids.length > 0 && queued === 0) {
            throw new SyncQueueUnavailableError();
        }
        return { queued };
    }

    private assertSyncable(connection: BankConnection): void {
        if (isSyncable(connection)) {
            return;
        }
        if (connection.statusReason === STATUS_REASONS.credentialsMissing) {
            throw new CredentialsMissingError();
        }
        throw new InvalidPluggyCredentialsError();
    }

    private async assertCredentials(): Promise<void> {
        const credential: PluggyCredential | null = await this.vault.current();
        if (credential === null) {
            throw new CredentialsMissingError();
        }
        if (credential.status === CREDENTIAL_STATUSES.invalid) {
            throw new InvalidPluggyCredentialsError();
        }
    }
}
