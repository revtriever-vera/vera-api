import { Injectable } from '@nestjs/common';
import { FinancialAccount, FinancialAccountService } from '../../transactions/services/financial-account.service';
import { BankConnection, BankConnectionAccount } from '../domain/bank-connections.types';
import { ConnectionLinkDomain } from '../domain/connection-link.domain';
import { mapAccount } from '../domain/pluggy-account.mapper';
import { errorNameOf, isFatalSyncError } from '../domain/sync-failure';
import { PluggySession } from '../drivers/pluggy-session';
import { PluggyAccount, PluggyClientPort } from '../ports/pluggy-client.port';
import { BankConnectionsLogService } from './bank-connections-log.service';

export interface LinkedPluggyAccount {
    readonly link: BankConnectionAccount;
    readonly account: PluggyAccount;
    readonly local: FinancialAccount;
}

export interface LinkedAccounts {
    readonly linked: readonly LinkedPluggyAccount[];
    readonly failed: number;
}

@Injectable()
export class PluggyAccountSyncService {
    public constructor(
        private readonly client: PluggyClientPort,
        private readonly accounts: FinancialAccountService,
        private readonly links: ConnectionLinkDomain,
        private readonly logs: BankConnectionsLogService
    ) {}

    public async sync(connection: BankConnection, session: PluggySession): Promise<LinkedAccounts> {
        const listed: readonly PluggyAccount[] = await this.client.listAccounts(session, connection.externalItemId);
        const linked: LinkedPluggyAccount[] = [];
        let failed: number = 0;
        for (const account of listed) {
            const result: LinkedPluggyAccount | null = await this.linkOne(connection, account);
            if (result === null) {
                failed += 1;
                continue;
            }
            linked.push(result);
        }
        return { linked, failed };
    }

    private async linkOne(connection: BankConnection, account: PluggyAccount): Promise<LinkedPluggyAccount | null> {
        try {
            const local: FinancialAccount = await this.accounts.upsertProviderAccount(mapAccount(account, connection.connectorName));
            const link: BankConnectionAccount = await this.links.link(connection.id, local.id, account.id);
            return { link, account, local };
        } catch (error: unknown) {
            if (isFatalSyncError(error)) {
                throw error;
            }
            this.logs.syncAccountFailed(connection.id, errorNameOf(error));
            return null;
        }
    }
}
