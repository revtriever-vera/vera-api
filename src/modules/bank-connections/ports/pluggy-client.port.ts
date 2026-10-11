import type { PluggyCredentialsPlain, PluggySession } from '../drivers/pluggy-session';

export type { PluggyCredentialsPlain, PluggySession };

export interface PluggyItem {
    readonly id: string;
    readonly status: string;
    readonly executionStatus: string | null;
    readonly connectorName: string | null;
    readonly institutionLogoUrl: string | null;
    readonly lastUpdatedAt: Date | null;
    readonly consentExpiresAt: Date | null;
}

export interface PluggyAccount {
    readonly id: string;
    readonly type: string;
    readonly subtype: string | null;
    readonly name: string;
    readonly marketingName: string | null;
    readonly number: string | null;
    readonly currencyCode: string;
}

export interface PluggyParty {
    readonly name: string | null;
    readonly documentNumber: string | null;
}

export interface PluggyPaymentData {
    readonly payer: PluggyParty | null;
    readonly receiver: PluggyParty | null;
}

export interface PluggyMerchant {
    readonly name: string | null;
    readonly businessName: string | null;
    readonly cnpj: string | null;
}

export interface PluggyTransaction {
    readonly id: string;
    readonly accountId: string;
    readonly date: string;
    readonly description: string;
    readonly descriptionRaw: string | null;
    readonly amount: number;
    readonly currencyCode: string;
    readonly amountInAccountCurrency: number | null;
    readonly status: string;
    readonly categoryId: string | null;
    readonly paymentData: PluggyPaymentData | null;
    readonly merchant: PluggyMerchant | null;
    readonly installmentNumber: number | null;
    readonly installmentTotal: number | null;
}

export interface PluggyTransactionQuery {
    readonly accountId: string;
    readonly from: string;
    readonly to: string;
    readonly cursor: string | null;
}

export interface PluggyTransactionPage {
    readonly items: readonly PluggyTransaction[];
    readonly next: string | null;
}

export abstract class PluggyClientPort {
    public abstract authenticate(credentials: PluggyCredentialsPlain): Promise<PluggySession>;
    public abstract getItem(session: PluggySession, itemId: string): Promise<PluggyItem | null>;
    public abstract listAccounts(session: PluggySession, itemId: string): Promise<readonly PluggyAccount[]>;
    public abstract listTransactions(session: PluggySession, query: PluggyTransactionQuery): Promise<PluggyTransactionPage>;
}
