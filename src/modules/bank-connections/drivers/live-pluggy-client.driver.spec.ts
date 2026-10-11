import { afterEach, describe, expect, it, vi } from 'vitest';
import { configOf } from '../../../../test/support/bank-connections-fakes';
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

    it('percorre as páginas de contas e normaliza os campos', async () => {
        const account = (id: string): Record<string, unknown> => ({
            id,
            type: 'BANK',
            subtype: 'CHECKING_ACCOUNT',
            name: 'Conta',
            marketingName: 'Conta Marketing',
            number: '12345-6',
            currencyCode: 'BRL',
            ignored: true
        });
        const fetchMock: ReturnType<typeof vi.fn> = vi
            .fn()
            .mockResolvedValueOnce(json(200, { results: [account('a1')], page: 1, totalPages: 2 }))
            .mockResolvedValueOnce(
                json(200, { results: [{ ...account('a2'), subtype: null, marketingName: null }], page: 2, totalPages: 2 })
            );
        vi.stubGlobal('fetch', fetchMock);

        const accounts = await driver.listAccounts(new PluggySession('k'), 'ITEM-1');

        expect(accounts.map((entry) => entry.id)).toEqual(['a1', 'a2']);
        expect(accounts[0]).toMatchObject({ marketingName: 'Conta Marketing', number: '12345-6' });
        expect(accounts[1]).toMatchObject({ subtype: null, marketingName: null });
        expect((fetchMock.mock.calls[0] as [string])[0]).toBe('https://pluggy.invalid/accounts?itemId=ITEM-1&page=1');
        expect((fetchMock.mock.calls[1] as [string])[0]).toContain('page=2');
    });

    it('sem totalPages lê só a primeira página de contas e rejeita corpo fora do formato', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { results: [] })));
        expect(await driver.listAccounts(new PluggySession('k'), 'i')).toEqual([]);

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { results: [{ id: 1 }] })));
        await expect(driver.listAccounts(new PluggySession('k'), 'i')).rejects.toMatchObject({ reason: 'format_invalid' });
    });

    const TRANSACTION_BODY: Record<string, unknown> = {
        id: 'tx-1',
        date: '2026-10-05T03:00:00.000Z',
        description: 'Pix enviado',
        descriptionRaw: 'PIX ENVIADO RAW',
        amount: -10.5,
        currencyCode: 'BRL',
        amountInAccountCurrency: null,
        status: 'POSTED',
        categoryId: '05000000',
        paymentData: {
            payer: null,
            receiver: { name: 'Maria', documentNumber: { type: 'CPF', value: '000.000.001-91' } }
        },
        merchant: { name: 'Loja', businessName: 'Loja LTDA', cnpj: '00000000000191' },
        creditCardMetadata: { installmentNumber: 2, totalInstallments: 3 }
    };

    it('lê a página v2 com cursor e mapeia pagamento, estabelecimento e parcelas', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(json(200, { items: [TRANSACTION_BODY], next: 'cursor-2' }));
        vi.stubGlobal('fetch', fetchMock);

        const page = await driver.listTransactions(new PluggySession('k'), {
            accountId: 'acc-1',
            from: '2026-10-01',
            to: '2026-10-10',
            cursor: 'cursor-1'
        });

        expect(page.next).toBe('cursor-2');
        expect(page.items[0]).toMatchObject({
            id: 'tx-1',
            accountId: 'acc-1',
            descriptionRaw: 'PIX ENVIADO RAW',
            amount: -10.5,
            paymentData: { payer: null, receiver: { name: 'Maria', documentNumber: '000.000.001-91' } },
            merchant: { name: 'Loja', businessName: 'Loja LTDA', cnpj: '00000000000191' },
            installmentNumber: 2,
            installmentTotal: 3
        });
        const url: URL = new URL((fetchMock.mock.calls[0] as [string])[0]);
        expect(url.pathname).toBe('/v2/transactions');
        expect(Object.fromEntries(url.searchParams)).toEqual({
            accountId: 'acc-1',
            dateFrom: '2026-10-01',
            dateTo: '2026-10-10',
            after: 'cursor-1'
        });
    });

    it('aceita results no lugar de items na v2, preenche os padrões e omite o cursor da primeira página', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi
            .fn()
            .mockResolvedValue(json(200, { results: [{ id: 'tx-2', date: '2026-10-05', description: 'X', amount: 1 }] }));
        vi.stubGlobal('fetch', fetchMock);

        const page = await driver.listTransactions(new PluggySession('k'), {
            accountId: 'acc-1',
            from: '2026-10-01',
            to: '2026-10-10',
            cursor: null
        });

        expect(page).toEqual({
            items: [
                {
                    id: 'tx-2',
                    accountId: 'acc-1',
                    date: '2026-10-05',
                    description: 'X',
                    descriptionRaw: null,
                    amount: 1,
                    currencyCode: 'BRL',
                    amountInAccountCurrency: null,
                    status: 'POSTED',
                    categoryId: null,
                    paymentData: null,
                    merchant: null,
                    installmentNumber: null,
                    installmentTotal: null
                }
            ],
            next: null
        });
        expect(new URL((fetchMock.mock.calls[0] as [string])[0]).searchParams.has('after')).toBe(false);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, {})));
        expect((await driver.listTransactions(new PluggySession('k'), { accountId: 'a', from: 'x', to: 'y', cursor: null })).items).toEqual(
            []
        );
    });

    it('usa o endpoint antigo por página quando configurado', async () => {
        const legacy: LivePluggyClientDriver = new LivePluggyClientDriver(
            configOf({ PLUGGY_BASE_URL: 'https://pluggy.invalid', PLUGGY_TRANSACTIONS_API: 'legacy' })
        );
        const fetchMock: ReturnType<typeof vi.fn> = vi
            .fn()
            .mockResolvedValueOnce(json(200, { results: [TRANSACTION_BODY], page: 1, totalPages: 2 }))
            .mockResolvedValueOnce(json(200, { results: [], page: 2, totalPages: 2 }));
        vi.stubGlobal('fetch', fetchMock);
        const query = { accountId: 'acc-1', from: '2026-10-01', to: '2026-10-10' };

        const first = await legacy.listTransactions(new PluggySession('k'), { ...query, cursor: null });
        const second = await legacy.listTransactions(new PluggySession('k'), { ...query, cursor: first.next });

        expect(first.next).toBe('2');
        expect(second.next).toBeNull();
        const url: URL = new URL((fetchMock.mock.calls[0] as [string])[0]);
        expect(url.pathname).toBe('/transactions');
        expect(Object.fromEntries(url.searchParams)).toEqual({
            accountId: 'acc-1',
            from: '2026-10-01',
            to: '2026-10-10',
            page: '1',
            pageSize: '500'
        });
        expect(new URL((fetchMock.mock.calls[1] as [string])[0]).searchParams.get('page')).toBe('2');
    });

    it('propaga o 429 das leituras com o atraso informado', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(429, {}, { 'retry-after': '30' })));

        await expect(
            driver.listTransactions(new PluggySession('k'), { accountId: 'a', from: 'x', to: 'y', cursor: null })
        ).rejects.toMatchObject({ reason: 'rate_limited', retryAfterSeconds: 30 });
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
