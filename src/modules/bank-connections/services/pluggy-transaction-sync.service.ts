import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { DateUtil } from '../../../shared/utils/date.util';
import { IngestionResult, TransactionIngestionService } from '../../transactions/services/transaction-ingestion.service';
import { bankConnectionsConfig } from '../config/bank-connections.config';
import { EMPTY_SYNC_COUNTS, MAX_TRANSACTION_PAGES, SyncCounts } from '../domain/bank-connections.types';
import { ConnectionLinkDomain } from '../domain/connection-link.domain';
import { MappedTransactions, TransactionMappingContext, mapTransactions } from '../domain/pluggy-transaction.mapper';
import { errorNameOf, isFatalSyncError } from '../domain/sync-failure';
import { SyncWindow, syncWindowOf } from '../domain/sync-window';
import { PluggySession } from '../drivers/pluggy-session';
import { PluggyClientPort, PluggyTransactionPage, PluggyTransactionQuery } from '../ports/pluggy-client.port';
import { BankConnectionsLogService } from './bank-connections-log.service';
import { LinkedPluggyAccount } from './pluggy-account-sync.service';

export interface TransactionSyncOutcome {
    readonly counts: SyncCounts;
    readonly succeeded: number;
    readonly failed: number;
}

function dateOnlyOf(value: Date | string | null): string | null {
    if (value === null) {
        return null;
    }
    return typeof value === 'string' ? value.slice(0, 10) : DateUtil.onlyLocalDateString(value);
}

function plus(counts: SyncCounts, page: PluggyTransactionPage, mapped: MappedTransactions, result: IngestionResult | null): SyncCounts {
    return {
        accounts: counts.accounts,
        fetched: counts.fetched + page.items.length,
        inserted: counts.inserted + (result?.inserted ?? 0),
        updated: counts.updated + (result?.updated ?? 0),
        duplicates: counts.duplicates + (result?.duplicates ?? 0) + (result?.superseded ?? 0),
        skippedPending: counts.skippedPending + mapped.skippedPending
    };
}

function merged(left: SyncCounts, right: SyncCounts): SyncCounts {
    return {
        accounts: left.accounts + right.accounts,
        fetched: left.fetched + right.fetched,
        inserted: left.inserted + right.inserted,
        updated: left.updated + right.updated,
        duplicates: left.duplicates + right.duplicates,
        skippedPending: left.skippedPending + right.skippedPending
    };
}

@Injectable()
export class PluggyTransactionSyncService {
    public constructor(
        private readonly client: PluggyClientPort,
        private readonly ingestion: TransactionIngestionService,
        private readonly links: ConnectionLinkDomain,
        private readonly logs: BankConnectionsLogService,
        @Inject(bankConnectionsConfig.KEY) private readonly config: ConfigType<typeof bankConnectionsConfig>
    ) {}

    public async syncAccounts(
        session: PluggySession,
        accounts: readonly LinkedPluggyAccount[],
        today: string,
        connectionId: string
    ): Promise<TransactionSyncOutcome> {
        let counts: SyncCounts = EMPTY_SYNC_COUNTS;
        let succeeded: number = 0;
        for (const account of accounts) {
            const synced: SyncCounts | null = await this.syncSafely(session, account, today, connectionId);
            counts = synced === null ? counts : merged(counts, synced);
            succeeded += synced === null ? 0 : 1;
        }
        return { counts, succeeded, failed: accounts.length - succeeded };
    }

    private async syncSafely(
        session: PluggySession,
        account: LinkedPluggyAccount,
        today: string,
        connectionId: string
    ): Promise<SyncCounts | null> {
        try {
            return await this.syncAccount(session, account, today);
        } catch (error: unknown) {
            if (isFatalSyncError(error)) {
                throw error;
            }
            this.logs.syncAccountFailed(connectionId, errorNameOf(error));
            return null;
        }
    }

    private async syncAccount(session: PluggySession, account: LinkedPluggyAccount, today: string): Promise<SyncCounts> {
        const window: SyncWindow = syncWindowOf(dateOnlyOf(account.link.syncedThrough), today, this.config.PLUGGY_INITIAL_HISTORY_DAYS);
        const context: TransactionMappingContext = {
            currency: account.local.currency,
            credit: account.local.kind === 'credit_card',
            shiftInstallmentDates: this.config.PLUGGY_SHIFT_INSTALLMENT_DATES
        };
        let counts: SyncCounts = EMPTY_SYNC_COUNTS;
        let cursor: string | null = null;
        let pages: number = 0;
        do {
            const page: PluggyTransactionPage = await this.client.listTransactions(session, this.queryOf(account, window, cursor));
            counts = await this.ingestPage(account, page, context, counts);
            cursor = page.next;
            pages += 1;
        } while (cursor !== null && pages < MAX_TRANSACTION_PAGES);
        if (cursor !== null) {
            throw new RangeError('transaction_pagination_limit');
        }
        await this.links.advance(account.link.id, window.to);
        return { ...counts, accounts: 1 };
    }

    private queryOf(account: LinkedPluggyAccount, window: SyncWindow, cursor: string | null): PluggyTransactionQuery {
        return { accountId: account.account.id, from: window.from, to: window.to, cursor };
    }

    private async ingestPage(
        account: LinkedPluggyAccount,
        page: PluggyTransactionPage,
        context: TransactionMappingContext,
        counts: SyncCounts
    ): Promise<SyncCounts> {
        const mapped: MappedTransactions = mapTransactions(page.items, context);
        const result: IngestionResult | null =
            mapped.items.length === 0
                ? null
                : await this.ingestion.ingest({ accountId: account.local.id, source: 'pluggy', items: mapped.items });
        return plus(counts, page, mapped, result);
    }
}
