import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { MetricsService } from '../../../core/observability/metrics.service';
import { PluggyAuthRejectedError, PluggyNotFoundError, PluggyUnavailableError } from '../ports/pluggy-client.errors';
import { PluggyClientPort } from '../ports/pluggy-client.port';
import { BankConnectionsLogService } from '../services/bank-connections-log.service';
import { BankConnectionsMetricsService } from '../services/bank-connections-metrics.service';
import { ObservedPluggyClient } from './observed-pluggy-client';
import { PluggyCredentialsPlain, PluggySession } from './pluggy-session';

function build(inner: Partial<PluggyClientPort>): { client: ObservedPluggyClient; count: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> } {
    const count: ReturnType<typeof vi.fn> = vi.fn();
    const info: ReturnType<typeof vi.fn> = vi.fn();
    const debug: ReturnType<typeof vi.fn> = vi.fn();
    const warn: ReturnType<typeof vi.fn> = vi.fn();
    const client: ObservedPluggyClient = new ObservedPluggyClient(
        inner as PluggyClientPort,
        new BankConnectionsLogService({ info, debug, warn } as unknown as LogService),
        new BankConnectionsMetricsService({ count } as unknown as MetricsService)
    );
    return { client, count, info, debug, warn };
}

const SESSION: PluggySession = new PluggySession('k');
const CREDENTIALS: PluggyCredentialsPlain = new PluggyCredentialsPlain('id', 'secret-sentinel-123456');

describe('ObservedPluggyClient', () => {
    it('conta e registra a chamada que deu certo sem expor credencial', async () => {
        const { client, count, debug } = build({ authenticate: vi.fn().mockResolvedValue(SESSION) });

        expect(await client.authenticate(CREDENTIALS)).toBe(SESSION);

        expect(count).toHaveBeenCalledWith('vera_pluggy_requests_total', { endpoint: 'auth', status: '2xx' });
        expect(debug).toHaveBeenCalledWith(
            expect.objectContaining({ identifier: 'bank-connections-provider', meta: { endpoint: 'auth', status: 200, reason: null, retryAfterSeconds: null } })
        );
        expect(JSON.stringify([count.mock.calls, debug.mock.calls])).not.toContain('secret-sentinel');
    });

    it('registra o item inexistente como 404', async () => {
        const { client, count } = build({ getItem: vi.fn().mockResolvedValue(null) });

        expect(await client.getItem(SESSION, 'i')).toBeNull();

        expect(count).toHaveBeenCalledWith('vera_pluggy_requests_total', { endpoint: 'item', status: '4xx' });
    });

    it.each([
        [new PluggyAuthRejectedError(), 'auth', '4xx', 401, 'auth_rejected', null],
        [new PluggyNotFoundError(), 'item', '4xx', 404, 'not_found', null],
        [new PluggyUnavailableError('rate_limited', 429, 60), 'accounts', '429', 429, 'rate_limited', 60],
        [new PluggyUnavailableError('server_error', 503, null), 'transactions', '5xx', 503, 'server_error', null],
        [new PluggyUnavailableError('timeout', null, null), 'auth', 'network', null, 'timeout', null],
        [new Error('boom'), 'auth', 'network', null, 'unexpected', null]
    ])('registra a falha %# e a relança', async (error, endpoint, statusClass, status, reason, retryAfterSeconds) => {
        const rejecting: ReturnType<typeof vi.fn> = vi.fn().mockRejectedValue(error);
        const { client, count, warn } = build({ authenticate: rejecting, getItem: rejecting, listAccounts: rejecting, listTransactions: rejecting });
        const calls: Record<string, () => Promise<unknown>> = {
            auth: async () => client.authenticate(CREDENTIALS),
            item: async () => client.getItem(SESSION, 'i'),
            accounts: async () => client.listAccounts(SESSION, 'i'),
            transactions: async () => client.listTransactions(SESSION, { accountId: 'a', from: null, cursor: null, pageSize: 50 })
        };

        await expect((calls[endpoint as string] as () => Promise<unknown>)()).rejects.toBe(error);

        expect(count).toHaveBeenCalledWith('vera_pluggy_requests_total', { endpoint, status: statusClass });
        expect(warn).toHaveBeenCalledWith(expect.objectContaining({ meta: { endpoint, status, reason, retryAfterSeconds } }));
    });

    it('delega contas e transações quando dão certo', async () => {
        const page = { results: [], nextCursor: null };
        const { client } = build({ listAccounts: vi.fn().mockResolvedValue([]), listTransactions: vi.fn().mockResolvedValue(page) });

        expect(await client.listAccounts(SESSION, 'i')).toEqual([]);
        expect(await client.listTransactions(SESSION, { accountId: 'a', from: null, cursor: null, pageSize: 50 })).toBe(page);
    });
});
