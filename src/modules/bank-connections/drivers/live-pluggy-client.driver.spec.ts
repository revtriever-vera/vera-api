import { afterEach, describe, expect, it, vi } from 'vitest';
import { configOf } from '../../../../test/support/bank-connections-fakes';
import { PluggyOperationNotSupportedError } from '../ports/pluggy-client.errors';
import { LivePluggyClientDriver } from './live-pluggy-client.driver';
import { PluggyCredentialsPlain, PluggySession } from './pluggy-session';

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers });
}

const ITEM_BODY: Record<string, unknown> = {
    id: 'ITEM-1',
    status: 'UPDATED',
    executionStatus: 'SUCCESS',
    connector: { id: 1, name: 'Nubank' },
    lastUpdatedAt: '2026-10-10T10:00:00.000Z',
    consentExpiresAt: '2027-01-10T10:00:00.000Z',
    ignored: 'x'
};

describe('LivePluggyClientDriver', () => {
    const driver: LivePluggyClientDriver = new LivePluggyClientDriver(
        configOf({ PLUGGY_DRIVER: 'live', PLUGGY_BASE_URL: 'https://pluggy.invalid' })
    );

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('autentica com o corpo das credenciais e devolve uma sessão que não mostra a chave', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(json(200, { apiKey: 'jwt-sentinel' }));
        vi.stubGlobal('fetch', fetchMock);

        const session: PluggySession = await driver.authenticate(new PluggyCredentialsPlain('client-id', 'client-secret-123456'));

        expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({
            clientId: 'client-id',
            clientSecret: 'client-secret-123456'
        });
        expect(session.headerValue()).toBe('jwt-sentinel');
        expect(JSON.stringify(session)).not.toContain('jwt-sentinel');
    });

    it('converte 401 em recusa e 5xx em indisponibilidade na autenticação', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(502, {})));
        const credentials: PluggyCredentialsPlain = new PluggyCredentialsPlain('id', 'secret-123456789012');

        await expect(driver.authenticate(credentials)).rejects.toMatchObject({ name: 'PluggyAuthRejectedError' });
        await expect(driver.authenticate(credentials)).rejects.toMatchObject({ name: 'PluggyUnavailableError', reason: 'server_error' });
    });

    it('rejeita autenticação sem apiKey como formato inválido', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { other: 1 })));

        await expect(driver.authenticate(new PluggyCredentialsPlain('id', 'secret-123456789012'))).rejects.toMatchObject({
            reason: 'format_invalid'
        });
    });

    it('lê o item com X-API-KEY e normaliza os campos', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(json(200, ITEM_BODY));
        vi.stubGlobal('fetch', fetchMock);

        const item = await driver.getItem(new PluggySession('jwt-1'), 'item 1');

        expect(fetchMock.mock.calls[0]?.[0]).toBe('https://pluggy.invalid/items/item%201');
        expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers).toMatchObject({ 'X-API-KEY': 'jwt-1' });
        expect(item).toEqual({
            id: 'ITEM-1',
            status: 'UPDATED',
            executionStatus: 'SUCCESS',
            connectorName: 'Nubank',
            lastUpdatedAt: new Date('2026-10-10T10:00:00.000Z'),
            consentExpiresAt: new Date('2027-01-10T10:00:00.000Z')
        });
    });

    it('aceita item sem conector e datas ausentes ou inválidas', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(json(200, { id: 'i', status: 'UPDATING' }))
                .mockResolvedValueOnce(json(200, { id: 'i', status: 'UPDATING', lastUpdatedAt: 'não é data', consentExpiresAt: null }))
        );

        expect(await driver.getItem(new PluggySession('k'), 'i')).toMatchObject({
            connectorName: null,
            lastUpdatedAt: null,
            consentExpiresAt: null
        });
        expect(await driver.getItem(new PluggySession('k'), 'i')).toMatchObject({ lastUpdatedAt: null, consentExpiresAt: null });
    });

    it('devolve nulo no 404 e repassa 429 com o Retry-After', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(json(404, {}))
                .mockResolvedValueOnce(json(429, {}, { 'retry-after': '60' }))
        );

        expect(await driver.getItem(new PluggySession('k'), 'i')).toBeNull();
        await expect(driver.getItem(new PluggySession('k'), 'i')).rejects.toMatchObject({
            name: 'PluggyUnavailableError',
            retryAfterSeconds: 60
        });
    });

    it('rejeita item com corpo fora do formato', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { id: 1 })));

        await expect(driver.getItem(new PluggySession('k'), 'i')).rejects.toMatchObject({ reason: 'format_invalid' });
    });

    it('deixa contas e transações para o card da sincronização', async () => {
        await expect(driver.listAccounts()).rejects.toBeInstanceOf(PluggyOperationNotSupportedError);
        await expect(
            driver.listTransactions(new PluggySession('k'), { accountId: 'a', from: null, cursor: null, pageSize: 50 })
        ).rejects.toBeInstanceOf(PluggyOperationNotSupportedError);
    });

    it('usa os caminhos configurados', async () => {
        const custom: LivePluggyClientDriver = new LivePluggyClientDriver(
            configOf({ PLUGGY_BASE_URL: 'https://pluggy.invalid', PLUGGY_AUTH_PATH: '/v9/auth', PLUGGY_ITEM_PATH: '/v9/items' })
        );
        const fetchMock: ReturnType<typeof vi.fn> = vi
            .fn()
            .mockImplementation(() => Promise.resolve(json(200, { apiKey: 'k', ...ITEM_BODY })));
        vi.stubGlobal('fetch', fetchMock);

        await custom.authenticate(new PluggyCredentialsPlain('id', 'secret-123456789012'));
        await custom.getItem(new PluggySession('k'), 'x');

        expect(fetchMock.mock.calls.map((call: unknown[]) => call[0])).toEqual([
            'https://pluggy.invalid/v9/auth',
            'https://pluggy.invalid/v9/items/x'
        ]);
    });
});
