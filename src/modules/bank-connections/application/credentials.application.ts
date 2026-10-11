import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { FinancialAccountService } from '../../transactions/services/financial-account.service';
import { BankConnectionDomain, Disconnection } from '../domain/bank-connection.domain';
import { InvalidPluggyCredentialsError, PluggyProviderUnavailableError } from '../domain/bank-connections.errors';
import {
    BankConnection,
    CREDENTIAL_ACTIONS,
    CredentialAction,
    CredentialStatus,
    CredentialsView,
    PluggyCredential,
    SYNC_TRIGGERS
} from '../domain/bank-connections.types';
import { toCredentialsView } from '../domain/connection.mapper';
import { ReplacedCredentials, SealedCredentials } from '../domain/pluggy-credentials.domain';
import { PluggyCredentialsPlain } from '../drivers/pluggy-session';
import { BankConnectionsLogService } from '../services/bank-connections-log.service';
import { BankConnectionsMetricsService } from '../services/bank-connections-metrics.service';
import { BankSyncPublisherService } from '../services/bank-sync-publisher.service';
import { CredentialsVaultService } from '../services/credentials-vault.service';
import { PluggyAuthenticatorService } from '../services/pluggy-authenticator.service';
import { SaveCredentialsBody } from '../validation/bank-connections.schemas';

interface PersistedCredentials extends ReplacedCredentials {
    readonly resumedIds: readonly string[];
}

@Injectable()
export class CredentialsApplication {
    public constructor(
        private readonly vault: CredentialsVaultService,
        private readonly authenticator: PluggyAuthenticatorService,
        private readonly connections: BankConnectionDomain,
        private readonly accounts: FinancialAccountService,
        private readonly sync: BankSyncPublisherService,
        private readonly logs: BankConnectionsLogService,
        private readonly metrics: BankConnectionsMetricsService
    ) {}

    public async get(): Promise<CredentialsView> {
        return toCredentialsView(await this.vault.current());
    }

    public async save(input: SaveCredentialsBody): Promise<CredentialsView> {
        const plain: PluggyCredentialsPlain = new PluggyCredentialsPlain(input.clientId, input.clientSecret);
        await this.verifyOrReject(plain);
        const persisted: PersistedCredentials = await this.persist(await this.vault.seal(plain));
        await this.sync.publishAll(persisted.resumedIds, SYNC_TRIGGERS.credentialsRotated);
        this.record(
            persisted.replaced ? CREDENTIAL_ACTIONS.rotated : CREDENTIAL_ACTIONS.saved,
            persisted.credential.status as CredentialStatus
        );
        return toCredentialsView(persisted.credential);
    }

    public async test(): Promise<CredentialsView> {
        try {
            await this.authenticator.authenticateStored(true);
        } catch (error: unknown) {
            return this.rejectedTest(error);
        }
        const credential: PluggyCredential = await this.vault.markValid();
        this.record(CREDENTIAL_ACTIONS.tested, credential.status as CredentialStatus);
        return toCredentialsView(credential);
    }

    public async remove(purgeTransactions: boolean): Promise<void> {
        await this.erase(purgeTransactions);
        this.logs.credentials(CREDENTIAL_ACTIONS.removed, null);
        this.metrics.credentials(CREDENTIAL_ACTIONS.removed, 'ok');
    }

    @UsingTransaction()
    private async persist(sealed: SealedCredentials): Promise<PersistedCredentials> {
        const stored: ReplacedCredentials = await this.vault.store(sealed);
        const resumed: BankConnection[] = await this.connections.resumePaused();
        return { ...stored, resumedIds: resumed.map((connection: BankConnection): string => connection.id) };
    }

    @UsingTransaction()
    private async erase(purgeTransactions: boolean): Promise<void> {
        await this.vault.remove();
        const disconnection: Disconnection = await this.connections.disconnectAll();
        if (purgeTransactions) {
            await this.accounts.removeProviderAccounts(disconnection.accountIds);
        }
    }

    private async verifyOrReject(plain: PluggyCredentialsPlain): Promise<void> {
        try {
            await this.authenticator.authenticate(plain);
        } catch (error: unknown) {
            this.recordFailure(error, CREDENTIAL_ACTIONS.saved);
            throw error;
        }
    }

    private async rejectedTest(error: unknown): Promise<CredentialsView> {
        this.recordFailure(error, CREDENTIAL_ACTIONS.tested);
        if (!(error instanceof InvalidPluggyCredentialsError)) {
            throw error;
        }
        return toCredentialsView(await this.vault.current());
    }

    private recordFailure(error: unknown, action: CredentialAction): void {
        if (error instanceof InvalidPluggyCredentialsError) {
            this.logs.credentials(CREDENTIAL_ACTIONS.rejected, null);
            this.metrics.credentials(CREDENTIAL_ACTIONS.rejected, 'rejected');
            return;
        }
        if (error instanceof PluggyProviderUnavailableError) {
            this.metrics.credentials(action, 'unavailable');
        }
    }

    private record(action: CredentialAction, status: CredentialStatus): void {
        this.logs.credentials(action, status);
        this.metrics.credentials(action, 'ok');
    }
}
