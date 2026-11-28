import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueueEnvelope } from '../../src/core/queue/queue.types';
import { NotifiedItemRegistrationHandler } from '../../src/modules/bank-connections/access/queue/notified-item-registration.handler';
import { PluggyWebhookUrlService } from '../../src/modules/bank-connections/services/pluggy-webhook-url.service';
import { Account, AllocationHarness } from './support/allocation-harness';
import { CapturingPublisher, PublishedMessage } from './support/queue';

const CLIENT_ID: string = '3f9a1b2c-4d5e-4f60-8a9b-c2e1d3f4a5b6';
const SECRET: string = 'vera-sentinel-7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
const CREDENTIALS: string = '/spending/connections/credentials';
const CONNECTIONS: string = '/spending/connections';
const CONNECT_TOKEN: string = '/spending/connections/connect-token';
const CONNECT_RESULT: string = '/spending/connections/connect-result';
const DEV_ITEM_CREATED: string = '/spending/connections/_dev/item-created';
const WEBHOOK_BASE: string = 'https://api.vera.example';
const ITEM_CREATED_TYPE: string = 'bank-connections.pluggy-item.created';
const NUBANK: string = '00000000-0000-4000-8000-00000000a001';
const ITAU: string = '00000000-0000-4000-8000-00000000a002';
const LOGIN_ERROR: string = '00000000-0000-4000-8000-00000000a409';

interface ResultsBody {
    readonly results: { outcome: string; connection: { id: string } | null }[];
}

interface TokenBody {
    readonly accessToken: string;
    readonly expiresAt: string;
    readonly webhookEnabled: boolean;
}

interface OverviewBody {
    readonly connections: { id: string }[];
}

describe('bank connections pluggy connect', () => {
    const publisher: CapturingPublisher = new CapturingPublisher();
    let harness: AllocationHarness;
    let webhookUrls: PluggyWebhookUrlService;

    beforeAll(async () => {
        process.env['PLUGGY_WEBHOOK_BASE_URL'] = WEBHOOK_BASE;
        harness = await AllocationHarness.start('bank_connect', publisher);
        webhookUrls = harness.app.get(PluggyWebhookUrlService, { strict: false });
    });

    afterAll(async () => {
        delete process.env['PLUGGY_WEBHOOK_BASE_URL'];
        await harness.stop();
    });

    async function withCredentials(label: string): Promise<Account> {
        const account: Account = await harness.signUp(label);
        await harness.call(account.token, 'PUT', CREDENTIALS, { clientId: CLIENT_ID, clientSecret: SECRET });
        return account;
    }

    function itemCreated(account: Account, itemId: string): Record<string, unknown> {
        return {
            event: 'item/created',
            eventId: crypto.randomUUID(),
            clientId: CLIENT_ID,
            itemId,
            triggeredBy: 'USER',
            clientUserId: account.company.id
        };
    }

    async function deliver(account: Account, message: PublishedMessage): Promise<void> {
        const handler: NotifiedItemRegistrationHandler = harness.app.get(NotifiedItemRegistrationHandler, { strict: false });
        const envelope: QueueEnvelope = {
            type: message.type,
            requestId: 'int-test',
            companyId: account.company.id,
            occurredAt: new Date().toISOString(),
            trace: {},
            payload: message.payload
        };
        await harness.inCompany(account.company.id, async () => handler.handle(envelope));
    }

    function lastItemCreated(itemId: string): PublishedMessage | undefined {
        return publisher.ofType(ITEM_CREATED_TYPE).findLast((message) => (message.payload as { itemId: string }).itemId === itemId);
    }

    it('exige sessão nas rotas do widget', async () => {
        expect((await harness.call(null, 'POST', CONNECT_TOKEN)).status).toBe(401);
        expect((await harness.call(null, 'POST', CONNECT_RESULT, { itemIds: [NUBANK] })).status).toBe(401);
    });

    it('sem credencial o connect token devolve credentials_missing', async () => {
        const account: Account = await harness.signUp('semcred');

        const response = await harness.call<{ type: string }>(account.token, 'POST', CONNECT_TOKEN);

        expect(response).toMatchObject({ status: 422, body: { type: 'connections.credentials_missing' } });
    });

    it('gera o connect token com a credencial da conta e o webhook ligado, sem devolver o segredo', async () => {
        const account: Account = await withCredentials('token');

        const response = await harness.call<TokenBody>(account.token, 'POST', CONNECT_TOKEN);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ accessToken: `mock-connect-token-webhook-${account.company.id}`, webhookEnabled: true });
        expect(JSON.stringify(response.body)).not.toContain('sentinel');
    });

    it('registra os itens do onSuccess e não duplica no reenvio nem na colagem manual', async () => {
        const account: Account = await withCredentials('resultado');

        const first = await harness.call<ResultsBody>(account.token, 'POST', CONNECT_RESULT, { itemIds: [NUBANK, LOGIN_ERROR] });
        const again = await harness.call<ResultsBody>(account.token, 'POST', CONNECT_RESULT, { itemIds: [NUBANK.toUpperCase()] });
        const pasted = await harness.call<ResultsBody>(account.token, 'POST', CONNECTIONS, { itemIds: [NUBANK] });

        expect(first.status).toBe(200);
        expect(first.body.results.map((result) => result.outcome)).toEqual(['connected', 'connected']);
        expect(again.body.results.map((result) => result.outcome)).toEqual(['already_connected']);
        expect(pasted.body.results.map((result) => result.outcome)).toEqual(['already_connected']);
        expect((await harness.call<OverviewBody>(account.token, 'GET', CONNECTIONS)).body.connections).toHaveLength(2);
    });

    it('a colagem manual de Item ID continua como plano B', async () => {
        const account: Account = await withCredentials('planob');

        const pasted = await harness.call<ResultsBody>(account.token, 'POST', CONNECTIONS, { itemIds: [ITAU] });

        expect(pasted.body.results.map((result) => result.outcome)).toEqual(['connected']);
    });

    it('o webhook item/created é público, enfileira e registra o item uma vez só, mesmo reentregue', async () => {
        const account: Account = await withCredentials('webhook');
        const path: string = `/webhooks/pluggy/${webhookUrls.tokenFor(account.company.id)}`;

        const received = await harness.call(null, 'POST', path, itemCreated(account, ITAU));
        const message: PublishedMessage | undefined = lastItemCreated(ITAU);
        expect(received.status).toBe(200);
        expect(message?.options?.jobId).toBe(`pluggy-item-created-${account.company.id}-${ITAU}`);

        await deliver(account, message as PublishedMessage);
        await deliver(account, message as PublishedMessage);
        const fromWidget = await harness.call<ResultsBody>(account.token, 'POST', CONNECT_RESULT, { itemIds: [ITAU] });

        expect(fromWidget.body.results.map((result) => result.outcome)).toEqual(['already_connected']);
        expect((await harness.call<OverviewBody>(account.token, 'GET', CONNECTIONS)).body.connections).toHaveLength(1);
    });

    it('o webhook recusa o token inválido com 401 e ignora o evento de outra company', async () => {
        const account: Account = await withCredentials('webhookruim');
        const other: Account = await harness.signUp('outra');
        const before: number = publisher.ofType(ITEM_CREATED_TYPE).length;

        const forged = await harness.call<{ type: string }>(null, 'POST', `/webhooks/pluggy/${account.company.id}.${'0'.repeat(64)}`, {});
        const foreign = await harness.call(
            null,
            'POST',
            `/webhooks/pluggy/${webhookUrls.tokenFor(account.company.id)}`,
            itemCreated(other, NUBANK)
        );

        expect(forged).toMatchObject({ status: 401, body: { type: 'connections.webhook_unauthorized' } });
        expect(foreign.status).toBe(200);
        expect(publisher.ofType(ITEM_CREATED_TYPE)).toHaveLength(before);
    });

    it('a rota de simulação do mock passa pelo caminho do webhook', async () => {
        const account: Account = await withCredentials('simulado');

        const response = await harness.call(account.token, 'POST', DEV_ITEM_CREATED, { itemId: LOGIN_ERROR });
        const message: PublishedMessage | undefined = lastItemCreated(LOGIN_ERROR);
        await deliver(account, message as PublishedMessage);

        expect(response.status).toBe(202);
        expect(message?.payload).toMatchObject({ itemId: LOGIN_ERROR, clientId: CLIENT_ID });
        expect((await harness.call<OverviewBody>(account.token, 'GET', CONNECTIONS)).body.connections).toHaveLength(1);
    });
});
