import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';
import { bankConnectionsConfig } from '../config/bank-connections.config';
import { sanitizeLogoUrl } from '../domain/institution-logo-url';
import { PluggyAccount, PluggyClientPort, PluggyItem, PluggyTransactionPage, PluggyTransactionQuery } from '../ports/pluggy-client.port';
import { PluggyNotFoundError, PluggyUnavailableError } from '../ports/pluggy-client.errors';
import {
    PluggyItemResponse,
    pluggyAccountsPageSchema,
    pluggyAuthResponseSchema,
    pluggyItemResponseSchema,
    pluggyTransactionsLegacyPageSchema,
    pluggyTransactionsV2PageSchema
} from '../validation/pluggy-responses.schemas';
import { PluggyHttp } from './pluggy-http';
import { toAccount, toTransaction } from './pluggy-response.mapper';
import { PluggyCredentialsPlain, PluggySession } from './pluggy-session';

const MAX_PAGES: number = 100;
const LEGACY_PAGE_SIZE: number = 500;

function queryOf(params: Readonly<Record<string, string>>): string {
    return new URLSearchParams(params).toString();
}

function dateOf(value: string | null | undefined): Date | null {
    if (value === null || value === undefined) {
        return null;
    }
    const parsed: Date = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parsed<T>(schema: z.ZodType<T>, body: unknown): T {
    const result: z.SafeParseReturnType<unknown, T> = schema.safeParse(body);
    if (!result.success) {
        throw new PluggyUnavailableError('format_invalid', null, null);
    }
    return result.data;
}

@Injectable()
export class LivePluggyClientDriver extends PluggyClientPort {
    private readonly http: PluggyHttp;
    private readonly itemPath: string;
    private readonly accountsPath: string;
    private readonly transactionsApi: 'v2' | 'legacy';
    private readonly transactionsPath: string;

    public constructor(@Inject(bankConnectionsConfig.KEY) config: ConfigType<typeof bankConnectionsConfig>) {
        super();
        this.http = new PluggyHttp(config.PLUGGY_BASE_URL, config.PLUGGY_AUTH_PATH, config.PLUGGY_HTTP_TIMEOUT_MS);
        this.itemPath = config.PLUGGY_ITEM_PATH;
        this.accountsPath = config.PLUGGY_ACCOUNTS_PATH;
        this.transactionsApi = config.PLUGGY_TRANSACTIONS_API;
        this.transactionsPath =
            config.PLUGGY_TRANSACTIONS_API === 'v2' ? config.PLUGGY_TRANSACTIONS_V2_PATH : config.PLUGGY_TRANSACTIONS_LEGACY_PATH;
    }

    public async authenticate(credentials: PluggyCredentialsPlain): Promise<PluggySession> {
        const body: unknown = await this.http.postAuth(credentials.pair());
        return new PluggySession(parsed(pluggyAuthResponseSchema, body).apiKey);
    }

    public async getItem(session: PluggySession, itemId: string): Promise<PluggyItem | null> {
        let body: unknown;
        try {
            body = await this.http.get(`${this.itemPath}/${encodeURIComponent(itemId)}`, session.headerValue());
        } catch (error: unknown) {
            if (error instanceof PluggyNotFoundError) {
                return null;
            }
            throw error;
        }
        const item: PluggyItemResponse = parsed(pluggyItemResponseSchema, body);
        return {
            id: item.id,
            status: item.status,
            executionStatus: item.executionStatus ?? null,
            connectorName: item.connector?.name ?? null,
            institutionLogoUrl: sanitizeLogoUrl(item.connector?.imageUrl),
            lastUpdatedAt: dateOf(item.lastUpdatedAt),
            consentExpiresAt: dateOf(item.consentExpiresAt)
        };
    }

    public async listAccounts(session: PluggySession, itemId: string): Promise<readonly PluggyAccount[]> {
        const accounts: PluggyAccount[] = [];
        let page: number = 1;
        let totalPages: number = 1;
        while (page <= totalPages && page <= MAX_PAGES) {
            const body: unknown = await this.http.get(
                `${this.accountsPath}?${queryOf({ itemId, page: String(page) })}`,
                session.headerValue()
            );
            const parsedPage: z.infer<typeof pluggyAccountsPageSchema> = parsed(pluggyAccountsPageSchema, body);
            accounts.push(...parsedPage.results.map(toAccount));
            totalPages = parsedPage.totalPages ?? 1;
            page += 1;
        }
        return accounts;
    }

    public async listTransactions(session: PluggySession, query: PluggyTransactionQuery): Promise<PluggyTransactionPage> {
        return this.transactionsApi === 'v2' ? this.listV2(session, query) : this.listLegacy(session, query);
    }

    private async listV2(session: PluggySession, query: PluggyTransactionQuery): Promise<PluggyTransactionPage> {
        const params: Record<string, string> = { accountId: query.accountId, dateFrom: query.from, dateTo: query.to };
        if (query.cursor !== null) {
            params['after'] = query.cursor;
        }
        const body: unknown = await this.http.get(`${this.transactionsPath}?${queryOf(params)}`, session.headerValue());
        const page: z.infer<typeof pluggyTransactionsV2PageSchema> = parsed(pluggyTransactionsV2PageSchema, body);
        return {
            items: (page.items ?? page.results ?? []).map((item) => toTransaction(item, query.accountId)),
            next: page.next ?? null
        };
    }

    private async listLegacy(session: PluggySession, query: PluggyTransactionQuery): Promise<PluggyTransactionPage> {
        const pageNumber: number = Number.parseInt(query.cursor ?? '1', 10);
        const params: Record<string, string> = {
            accountId: query.accountId,
            from: query.from,
            to: query.to,
            page: String(pageNumber),
            pageSize: String(LEGACY_PAGE_SIZE)
        };
        const body: unknown = await this.http.get(`${this.transactionsPath}?${queryOf(params)}`, session.headerValue());
        const page: z.infer<typeof pluggyTransactionsLegacyPageSchema> = parsed(pluggyTransactionsLegacyPageSchema, body);
        return {
            items: page.results.map((item) => toTransaction(item, query.accountId)),
            next: pageNumber < (page.totalPages ?? 1) ? String(pageNumber + 1) : null
        };
    }
}
