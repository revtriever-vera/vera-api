import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { FinancialAccountService } from '../../transactions/services/financial-account.service';
import { BankConnectionDomain, Disconnection } from '../domain/bank-connection.domain';
import { ConnectionView, CredentialsView, ItemResultView } from '../domain/bank-connections.types';
import { toCredentialsView } from '../domain/connection.mapper';
import { PluggySession } from '../drivers/pluggy-session';
import { ConnectionViewService } from '../services/connection-view.service';
import { CredentialsVaultService } from '../services/credentials-vault.service';
import { ItemRegistrationService } from '../services/item-registration.service';
import { PluggyAuthenticatorService } from '../services/pluggy-authenticator.service';

export interface ConnectionsOverview {
    readonly credentials: CredentialsView;
    readonly connections: ConnectionView[];
}

@Injectable()
export class ConnectionsApplication {
    public constructor(
        private readonly vault: CredentialsVaultService,
        private readonly authenticator: PluggyAuthenticatorService,
        private readonly registrar: ItemRegistrationService,
        private readonly connections: BankConnectionDomain,
        private readonly views: ConnectionViewService,
        private readonly accounts: FinancialAccountService
    ) {}

    public async overview(): Promise<ConnectionsOverview> {
        return {
            credentials: toCredentialsView(await this.vault.current()),
            connections: await this.views.listViews()
        };
    }

    public async connect(itemIds: readonly string[]): Promise<{ results: ItemResultView[] }> {
        const session: PluggySession = await this.authenticator.authenticateStored(false);
        return { results: await this.registrar.register(session, itemIds) };
    }

    public async disconnect(id: string, purgeTransactions: boolean): Promise<void> {
        await this.erase(id, purgeTransactions);
    }

    @UsingTransaction()
    private async erase(id: string, purgeTransactions: boolean): Promise<void> {
        const disconnection: Disconnection = await this.connections.disconnect(id);
        if (purgeTransactions) {
            await this.accounts.removeProviderAccounts(disconnection.accountIds);
        }
    }
}
