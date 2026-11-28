import { describe, expect, it, vi } from 'vitest';
import {
    buildFixture,
    CLIENT_ID,
    COMPANY_ID,
    Fixture,
    ITEM_ITAU,
    ITEM_MISSING,
    ITEM_NUBANK,
    SENTINEL
} from '../../../../test/support/bank-connections-fakes';
import { PluggyConnectToken } from '../drivers/pluggy-session';
import { PluggyAuthRejectedError, PluggyUnavailableError } from '../ports/pluggy-client.errors';

const WEBHOOK_BASE: string = 'https://api.vera.example';
const OTHER_COMPANY: string = '00000000-0000-4000-8000-0000000000c2';

async function withCredentials(options: Parameters<typeof buildFixture>[0] = {}): Promise<Fixture> {
    const fixture: Fixture = buildFixture(options);
    await fixture.credentialsApplication.save({ clientId: CLIENT_ID, clientSecret: SENTINEL });
    return fixture;
}

function itemCreated(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        event: 'item/created',
        eventId: 'd876fd7c-e9bd-4c4c-bd46-cc96c62aac29',
        clientId: CLIENT_ID,
        itemId: ITEM_NUBANK,
        triggeredBy: 'USER',
        clientUserId: COMPANY_ID,
        ...overrides
    };
}

describe('PluggyConnectApplication', () => {
    describe('connectToken', () => {
        it('sem credencial devolve credentials_missing', async () => {
            await expect(buildFixture().pluggyConnectApplication.connectToken()).rejects.toMatchObject({
                code: 'connections.credentials_missing'
            });
        });

        it('sem URL pública gera o token só com o clientUserId da company e avisa que o webhook está desligado', async () => {
            const fixture: Fixture = await withCredentials();
            const create = vi.spyOn(fixture.client, 'createConnectToken');

            const view = await fixture.pluggyConnectApplication.connectToken();

            expect(create).toHaveBeenCalledWith(expect.anything(), { clientUserId: COMPANY_ID, webhookUrl: null });
            expect(view).toMatchObject({ accessToken: `mock-connect-token-on-success-${COMPANY_ID}`, webhookEnabled: false });
            expect(Date.parse(view.expiresAt) - Date.now()).toBeGreaterThan(29 * 60_000);
        });

        it('com URL pública leva o webhookUrl assinado da company', async () => {
            const fixture: Fixture = await withCredentials({ config: { PLUGGY_WEBHOOK_BASE_URL: WEBHOOK_BASE } });
            const create = vi.spyOn(fixture.client, 'createConnectToken');

            const view = await fixture.pluggyConnectApplication.connectToken();

            const url: string = `${WEBHOOK_BASE}/webhooks/pluggy/${fixture.webhookUrls.tokenFor(COMPANY_ID)}`;
            expect(create).toHaveBeenCalledWith(expect.anything(), { clientUserId: COMPANY_ID, webhookUrl: url });
            expect(view.webhookEnabled).toBe(true);
        });

        it('converte a recusa e a indisponibilidade da Pluggy nos erros da rota', async () => {
            const fixture: Fixture = await withCredentials();
            vi.spyOn(fixture.client, 'createConnectToken')
                .mockRejectedValueOnce(new PluggyAuthRejectedError())
                .mockRejectedValueOnce(new PluggyUnavailableError('rate_limited', 429, 30))
                .mockRejectedValueOnce(new Error('boom'));

            await expect(fixture.pluggyConnectApplication.connectToken()).rejects.toMatchObject({
                code: 'connections.invalid_credentials'
            });
            await expect(fixture.pluggyConnectApplication.connectToken()).rejects.toMatchObject({
                code: 'connections.provider_unavailable',
                meta: { retryAfterSeconds: 30 }
            });
            await expect(fixture.pluggyConnectApplication.connectToken()).rejects.toThrow('boom');
        });

        it('nunca registra o token nem o segredo nos logs', async () => {
            const fixture: Fixture = await withCredentials();
            vi.spyOn(fixture.client, 'createConnectToken').mockResolvedValue(new PluggyConnectToken('connect-sentinel'));

            await fixture.pluggyConnectApplication.connectToken();

            expect(JSON.stringify(fixture.logCalls)).not.toContain('connect-sentinel');
            expect(JSON.stringify(fixture.logCalls)).not.toContain(SENTINEL);
        });
    });

    describe('connectResult', () => {
        it('registra os itens do onSuccess e responde already_connected no reenvio, sem duplicar', async () => {
            const fixture: Fixture = await withCredentials();

            const first = await fixture.pluggyConnectApplication.connectResult([ITEM_NUBANK, ITEM_MISSING]);
            const again = await fixture.pluggyConnectApplication.connectResult([ITEM_NUBANK]);

            expect(first.results.map((result) => result.outcome)).toEqual(['connected', 'not_found']);
            expect(again.results.map((result) => result.outcome)).toEqual(['already_connected']);
            expect(fixture.connections.rows).toHaveLength(1);
        });
    });

    describe('receiveWebhook', () => {
        it('recusa o token inválido com webhook_unauthorized', async () => {
            const fixture: Fixture = buildFixture();

            await expect(fixture.pluggyConnectApplication.receiveWebhook('nao-assinado', itemCreated())).rejects.toMatchObject({
                code: 'connections.webhook_unauthorized',
                status: 401
            });
        });

        it('enfileira o item/created com jobId determinístico pelo item', async () => {
            const fixture: Fixture = buildFixture();

            await fixture.pluggyConnectApplication.receiveWebhook(fixture.webhookUrls.tokenFor(COMPANY_ID), itemCreated());

            expect(fixture.publisher.published).toEqual([
                {
                    queue: 'vera-bank-connections',
                    type: 'bank-connections.pluggy-item.created',
                    payload: { itemId: ITEM_NUBANK, clientId: CLIENT_ID, eventId: 'd876fd7c-e9bd-4c4c-bd46-cc96c62aac29' },
                    options: expect.objectContaining({ jobId: `pluggy-item-created-${COMPANY_ID}-${ITEM_NUBANK}` }) as unknown
                }
            ]);
        });

        it.each([
            ['outro evento', itemCreated({ event: 'item/updated' })],
            ['sem itemId', itemCreated({ itemId: null })],
            ['clientUserId de outra company', itemCreated({ clientUserId: OTHER_COMPANY })],
            ['corpo fora do formato', 'nada']
        ])('ignora sem enfileirar: %s', async (_label: string, body: unknown) => {
            const fixture: Fixture = buildFixture();

            await fixture.pluggyConnectApplication.receiveWebhook(fixture.webhookUrls.tokenFor(COMPANY_ID), body);

            expect(fixture.publisher.published).toEqual([]);
        });
    });

    describe('registerNotified', () => {
        const payload: Record<string, unknown> = { itemId: ITEM_ITAU, clientId: CLIENT_ID, eventId: 'e-1' };

        it('registra o item notificado e é idempotente na reentrega', async () => {
            const fixture: Fixture = await withCredentials();

            expect(await fixture.pluggyConnectApplication.registerNotified(payload)).toBe('connected');
            expect(await fixture.pluggyConnectApplication.registerNotified(payload)).toBe('already_connected');

            expect(fixture.connections.rows).toHaveLength(1);
            expect(fixture.publisher.published.filter((message) => message.type === 'bank-connections.sync.requested')).toHaveLength(1);
        });

        it('o item já colado à mão ou vindo do onSuccess responde already_connected', async () => {
            const fixture: Fixture = await withCredentials();
            await fixture.connectionsApplication.connect([ITEM_ITAU]);

            expect(await fixture.pluggyConnectApplication.registerNotified(payload)).toBe('already_connected');
            expect(fixture.connections.rows).toHaveLength(1);
        });

        it('descarta o clientId de outra aplicação sem chamar a Pluggy', async () => {
            const fixture: Fixture = await withCredentials();
            const getItem = vi.spyOn(fixture.client, 'getItem');

            expect(await fixture.pluggyConnectApplication.registerNotified({ ...payload, clientId: 'outra-aplicacao' })).toBe(
                'client_mismatch'
            );

            expect(getItem).not.toHaveBeenCalled();
            expect(fixture.connections.rows).toHaveLength(0);
        });

        it('sem credencial utilizável ou com payload inválido não cria nada', async () => {
            const missing: Fixture = buildFixture();
            const invalid: Fixture = await withCredentials();
            await invalid.vault.markInvalid('invalid_credentials');

            expect(await missing.pluggyConnectApplication.registerNotified(payload)).toBe('credentials_unusable');
            expect(await invalid.pluggyConnectApplication.registerNotified(payload)).toBe('credentials_unusable');
            expect(await missing.pluggyConnectApplication.registerNotified({ itemId: 'x' })).toBe('ignored');
        });

        it('marca a credencial recusada pela Pluggy como inválida', async () => {
            const fixture: Fixture = await withCredentials();
            vi.spyOn(fixture.client, 'authenticate').mockRejectedValue(new PluggyAuthRejectedError());

            expect(await fixture.pluggyConnectApplication.registerNotified(payload)).toBe('credentials_unusable');

            expect(fixture.credentials.rows[0]).toMatchObject({ status: 'invalid' });
        });

        it('devolve failed quando a Pluggy falha na leitura do item, para o handler tentar de novo', async () => {
            const fixture: Fixture = await withCredentials();
            vi.spyOn(fixture.client, 'getItem').mockRejectedValue(new PluggyUnavailableError('server_error', 503, null));

            expect(await fixture.pluggyConnectApplication.registerNotified(payload)).toBe('failed');
        });
    });

    describe('simulateItemCreated', () => {
        it('passa pelo mesmo caminho do webhook e enfileira o item do mock', async () => {
            const fixture: Fixture = await withCredentials();

            await fixture.pluggyConnectApplication.simulateItemCreated(ITEM_NUBANK);

            expect(fixture.publisher.published.at(-1)).toMatchObject({
                type: 'bank-connections.pluggy-item.created',
                payload: { itemId: ITEM_NUBANK, clientId: CLIENT_ID }
            });
        });
    });
});
