import type { PluggyCredentialsPlain, PluggySession } from '../drivers/pluggy-session';

export type { PluggyCredentialsPlain, PluggySession };

export interface PluggyItem {
    readonly id: string;
    readonly status: string;
    readonly executionStatus: string | null;
    readonly connectorName: string | null;
    readonly lastUpdatedAt: Date | null;
    readonly consentExpiresAt: Date | null;
}

export interface PluggyAccount {
    readonly id: string;
    readonly type: string;
    readonly subtype: string | null;
    readonly name: string;
    readonly number: string | null;
    readonly currencyCode: string;
}

export interface PluggyTransaction {
    readonly id: string;
    readonly accountId: string;
    readonly date: string;
    readonly description: string;
    readonly amount: number;
    readonly currencyCode: string;
    readonly amountInAccountCurrency: number | null;
    readonly status: string;
    readonly categoryId: string | null;
    readonly receiverName: string | null;
    readonly receiverDocument: string | null;
}

export interface PluggyTransactionQuery {
    readonly accountId: string;
    readonly from: string | null;
    readonly cursor: string | null;
    readonly pageSize: number;
}

export interface PluggyTransactionPage {
    readonly results: readonly PluggyTransaction[];
    readonly nextCursor: string | null;
}

export abstract class PluggyClientPort {
    public abstract authenticate(credentials: PluggyCredentialsPlain): Promise<PluggySession>;
    public abstract getItem(session: PluggySession, itemId: string): Promise<PluggyItem | null>;
    public abstract listAccounts(session: PluggySession, itemId: string): Promise<readonly PluggyAccount[]>;
    public abstract listTransactions(session: PluggySession, query: PluggyTransactionQuery): Promise<PluggyTransactionPage>;
}
