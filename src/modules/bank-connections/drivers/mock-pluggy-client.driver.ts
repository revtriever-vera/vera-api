import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { DateUtil } from '../../../shared/utils/date.util';
import {
    DatasetAccount,
    DatasetTransaction,
    SpendingDataset,
    SpendingDatasetService
} from '../../transactions/services/spending-dataset.service';
import { bankConnectionsConfig } from '../config/bank-connections.config';
import { PluggyAuthRejectedError, PluggyUnavailableError } from '../ports/pluggy-client.errors';
import {
    PluggyAccount,
    PluggyClientPort,
    PluggyItem,
    PluggyParty,
    PluggyPaymentData,
    PluggyTransaction,
    PluggyTransactionPage,
    PluggyTransactionQuery
} from '../ports/pluggy-client.port';
import { PluggyCredentialsPlain, PluggySession } from './pluggy-session';

export const MOCK_INVALID_SECRET: string = 'mock-invalid-secret';
export const MOCK_UNAVAILABLE_SECRET: string = 'mock-unavailable-secret';
export const MOCK_ITEM_NUBANK: string = '00000000-0000-4000-8000-00000000a001';
export const MOCK_ITEM_ITAU: string = '00000000-0000-4000-8000-00000000a002';
export const MOCK_ITEM_NOT_FOUND: string = '00000000-0000-4000-8000-00000000a404';
export const MOCK_ITEM_LOGIN_ERROR: string = '00000000-0000-4000-8000-00000000a409';
export const MOCK_PAGE_SIZE: number = 50;

const MOCK_API_KEY: string = 'mock-api-key';
const CONSENT_DAYS: number = 90;
const CREDIT_ACCOUNT_TYPE: string = 'CREDIT';
const BANK_ACCOUNT_TYPE: string = 'BANK';
const CREDIT_KIND: string = 'credit_card';
const MINOR_UNITS: number = 100;
const SERVICE_UNAVAILABLE: number = 503;

interface MockItem {
    readonly connectorName: string;
    readonly status: string;
    readonly accountKeys: readonly string[];
}

const MOCK_ITEMS: ReadonlyMap<string, MockItem> = new Map<string, MockItem>([
    [MOCK_ITEM_NUBANK, { connectorName: 'Nubank', status: 'UPDATED', accountKeys: ['nubank-checking', 'nubank-card'] }],
    [MOCK_ITEM_ITAU, { connectorName: 'Itaú', status: 'UPDATED', accountKeys: ['itau-checking'] }],
    [MOCK_ITEM_LOGIN_ERROR, { connectorName: 'Banco Teste', status: 'LOGIN_ERROR', accountKeys: [] }]
]);

function cursorOffset(cursor: string | null): number {
    const offset: number = Number.parseInt(cursor ?? '', 10);
    return Number.isInteger(offset) && offset > 0 ? offset : 0;
}

@Injectable()
export class MockPluggyClientDriver extends PluggyClientPort {
    public constructor(
        @Inject(bankConnectionsConfig.KEY) private readonly config: ConfigType<typeof bankConnectionsConfig>,
        private readonly datasets: SpendingDatasetService
    ) {
        super();
    }

    public authenticate(credentials: PluggyCredentialsPlain): Promise<PluggySession> {
        const secret: string = credentials.pair().clientSecret;
        if (this.config.MOCK_PLUGGY_FORCE_401 || secret === MOCK_INVALID_SECRET) {
            return Promise.reject(new PluggyAuthRejectedError());
        }
        if (secret === MOCK_UNAVAILABLE_SECRET) {
            return Promise.reject(new PluggyUnavailableError('server_error', SERVICE_UNAVAILABLE, null));
        }
        return Promise.resolve(new PluggySession(MOCK_API_KEY));
    }

    public getItem(_session: PluggySession, itemId: string): Promise<PluggyItem | null> {
        const mock: MockItem | undefined = MOCK_ITEMS.get(itemId.toLowerCase());
        if (mock === undefined || this.config.MOCK_PLUGGY_REVOKED_ITEMS.includes(itemId.toLowerCase())) {
            return Promise.resolve(null);
        }
        return Promise.resolve({
            id: itemId.toLowerCase(),
            status: mock.status,
            executionStatus: mock.status === 'UPDATED' ? 'SUCCESS' : 'LOGIN_ERROR',
            connectorName: mock.connectorName,
            lastUpdatedAt: new Date(),
            consentExpiresAt: new Date(Date.now() + CONSENT_DAYS * 86_400_000)
        });
    }

    public listAccounts(_session: PluggySession, itemId: string): Promise<readonly PluggyAccount[]> {
        const keys: ReadonlySet<string> = new Set<string>(MOCK_ITEMS.get(itemId.toLowerCase())?.accountKeys ?? []);
        const accounts: PluggyAccount[] = this.dataset()
            .accounts.filter((account: DatasetAccount): boolean => keys.has(account.key))
            .map((account: DatasetAccount): PluggyAccount => ({
                id: account.key,
                type: account.kind === CREDIT_KIND ? CREDIT_ACCOUNT_TYPE : BANK_ACCOUNT_TYPE,
                subtype: account.kind === CREDIT_KIND ? 'CREDIT_CARD' : 'CHECKING_ACCOUNT',
                name: account.name,
                marketingName: null,
                number: account.numberLast4,
                currencyCode: account.currency
            }));
        return Promise.resolve(accounts);
    }

    public listTransactions(_session: PluggySession, query: PluggyTransactionQuery): Promise<PluggyTransactionPage> {
        const dataset: SpendingDataset = this.dataset();
        const credit: boolean = dataset.accounts.some(
            (account: DatasetAccount): boolean => account.key === query.accountId && account.kind === CREDIT_KIND
        );
        const matching: DatasetTransaction[] = dataset.transactions.filter(
            (transaction: DatasetTransaction): boolean =>
                transaction.accountKey === query.accountId && transaction.date >= query.from && transaction.date <= query.to
        );
        const offset: number = cursorOffset(query.cursor);
        const next: number = offset + MOCK_PAGE_SIZE;
        return Promise.resolve({
            items: matching
                .slice(offset, next)
                .map((transaction: DatasetTransaction): PluggyTransaction => this.toTransaction(transaction, credit)),
            next: next < matching.length ? String(next) : null
        });
    }

    private dataset(): SpendingDataset {
        return this.datasets.build(DateUtil.todayInBrazil());
    }

    private toTransaction(transaction: DatasetTransaction, credit: boolean): PluggyTransaction {
        const signed: number = credit ? -transaction.amountMinor : transaction.amountMinor;
        return {
            id: `mock-${transaction.key}`,
            accountId: transaction.accountKey,
            date: transaction.date,
            description: transaction.description,
            descriptionRaw: null,
            amount: signed / MINOR_UNITS,
            currencyCode: 'BRL',
            amountInAccountCurrency: null,
            status: 'POSTED',
            categoryId: transaction.providerCategoryId,
            paymentData: this.paymentDataOf(transaction),
            merchant: null,
            installmentNumber: null,
            installmentTotal: null
        };
    }

    private paymentDataOf(transaction: DatasetTransaction): PluggyPaymentData | null {
        if (transaction.counterpartyName === null) {
            return null;
        }
        const party: PluggyParty = { name: transaction.counterpartyName, documentNumber: transaction.counterpartyDocument };
        return transaction.amountMinor < 0 ? { payer: null, receiver: party } : { payer: party, receiver: null };
    }
}
