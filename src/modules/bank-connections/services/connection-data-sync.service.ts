import { Injectable } from '@nestjs/common';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { BankConnectionDomain } from '../domain/bank-connection.domain';
import { BankConnection, EMPTY_SYNC_COUNTS, SyncCounts } from '../domain/bank-connections.types';
import { PluggySession } from '../drivers/pluggy-session';
import { PluggyClientPort, PluggyItem } from '../ports/pluggy-client.port';
import { LinkedAccounts, PluggyAccountSyncService } from './pluggy-account-sync.service';
import { PluggyTransactionSyncService, TransactionSyncOutcome } from './pluggy-transaction-sync.service';

export interface DataPull {
    readonly revoked: boolean;
    readonly counts: SyncCounts;
    readonly succeededAccounts: number;
    readonly failedAccounts: number;
}

const REVOKED_PULL: DataPull = { revoked: true, counts: EMPTY_SYNC_COUNTS, succeededAccounts: 0, failedAccounts: 0 };

@Injectable()
export class ConnectionDataSyncService {
    public constructor(
        private readonly client: PluggyClientPort,
        private readonly connections: BankConnectionDomain,
        private readonly accountSync: PluggyAccountSyncService,
        private readonly transactionSync: PluggyTransactionSyncService,
        private readonly timezone: CompanyTimezoneService
    ) {}

    public async pull(connection: BankConnection, session: PluggySession): Promise<DataPull> {
        const item: PluggyItem | null = await this.client.getItem(session, connection.externalItemId);
        if (item === null) {
            await this.connections.revoke(connection.id);
            return REVOKED_PULL;
        }
        const current: BankConnection = (await this.connections.applyItem(connection.id, item)) ?? connection;
        const linked: LinkedAccounts = await this.accountSync.sync(current, session);
        const data: TransactionSyncOutcome = await this.transactionSync.syncAccounts(
            session,
            linked.linked,
            await this.timezone.todayInCompany(),
            connection.id
        );
        return {
            revoked: false,
            counts: { ...data.counts, accounts: linked.linked.length },
            succeededAccounts: data.succeeded,
            failedAccounts: linked.failed + data.failed
        };
    }
}
