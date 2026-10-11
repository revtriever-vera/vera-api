import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';
import { bankConnectionsConfig } from '../config/bank-connections.config';
import { PluggyAccount, PluggyClientPort, PluggyItem, PluggyTransactionPage, PluggyTransactionQuery } from '../ports/pluggy-client.port';
import { PluggyNotFoundError, PluggyOperationNotSupportedError, PluggyUnavailableError } from '../ports/pluggy-client.errors';
import { PluggyItemResponse, pluggyAuthResponseSchema, pluggyItemResponseSchema } from '../validation/pluggy-responses.schemas';
import { PluggyHttp } from './pluggy-http';
import { PluggyCredentialsPlain, PluggySession } from './pluggy-session';

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

    public constructor(@Inject(bankConnectionsConfig.KEY) config: ConfigType<typeof bankConnectionsConfig>) {
        super();
        this.http = new PluggyHttp(config.PLUGGY_BASE_URL, config.PLUGGY_AUTH_PATH, config.PLUGGY_HTTP_TIMEOUT_MS);
        this.itemPath = config.PLUGGY_ITEM_PATH;
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
            lastUpdatedAt: dateOf(item.lastUpdatedAt),
            consentExpiresAt: dateOf(item.consentExpiresAt)
        };
    }

    public listAccounts(): Promise<readonly PluggyAccount[]> {
        return Promise.reject(new PluggyOperationNotSupportedError('listAccounts'));
    }

    public listTransactions(_session: PluggySession, _query: PluggyTransactionQuery): Promise<PluggyTransactionPage> {
        return Promise.reject(new PluggyOperationNotSupportedError('listTransactions'));
    }
}
