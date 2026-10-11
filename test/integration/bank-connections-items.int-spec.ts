import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FinancialAccountService } from '../../src/modules/transactions/services/financial-account.service';
import { Account, AllocationHarness } from './support/allocation-harness';
import { CapturingPublisher, PublishedMessage } from './support/queue';

const CLIENT_ID: string = '3f9a1b2c-4d5e-4f60-8a9b-c2e1d3f4a5b6';
const SECRET: string = 'vera-sentinel-1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const CREDENTIALS: string = '/spending/connections/credentials';
const CONNECTIONS: string = '/spending/connections';
const NUBANK: string = '00000000-0000-4000-8000-00000000a001';
const ITAU: string = '00000000-0000-4000-8000-00000000a002';
const MISSING: string = '00000000-0000-4000-8000-00000000a404';
const LOGIN_ERROR: string = '00000000-0000-4000-8000-00000000a409';

interface ConnectionBody {
    readonly id: string;
    readonly status: string;
    readonly statusReason: string | null;
    readonly connectorName: string | null;
    readonly accounts: { accountId: string; name: string }[];
}

interface ResultsBody {
    readonly results: { outcome: string; connection: ConnectionBody | null }[];
}

interface OverviewBody {
    readonly credentials: { configured: boolean };
    readonly connections: ConnectionBody[];
}

describe('bank connections items', () => {
    const publisher: CapturingPublisher = new CapturingPublisher();
    let harness: AllocationHarness;

    beforeAll(async () => {
        harness = await AllocationHarness.start('bank_items', publisher);
    });

    afterAll(async () => {
        await harness.stop();
    });

    function messageOf(connectionId: string, trigger: string): PublishedMessage | undefined {
        return publisher.published.find((message) => {
            const payload: { connectionId?: string; trigger?: string } = message.payload as { connectionId?: string; trigger?: string };
            return payload.connectionId === connectionId && payload.trigger === trigger;
        });
    }

    async function withCredentials(label: string): Promise<Account> {
        const account: Account = await harness.signUp(label);
        await harness.call(account.token, 'PUT', CREDENTIALS, { clientId: CLIENT_ID, clientSecret: SECRET });
        return account;
    }

    it('exige sessão', async () => {
        const id: string = crypto.randomUUID();

        expect((await harness.call(null, 'GET', CONNECTIONS)).status).toBe(401);
        expect((await harness.call(null, 'POST', CONNECTIONS, {})).status).toBe(401);
        expect((await harness.call(null, 'DELETE', `${CONNECTIONS}/${id}`)).status).toBe(401);
    });

    it('sem credencial devolve credentials_missing', async () => {
        const account: Account = await harness.signUp('semcred');

        const response = await harness.call<{ type: string }>(account.token, 'POST', CONNECTIONS, { itemIds: [NUBANK] });

        expect(response).toMatchObject({ status: 422, body: { type: 'connections.credentials_missing' } });
    });

    it('conecta os itens, deduplica, publica as sincronizações e responde already_connected no reenvio', async () => {
        const account: Account = await withCredentials('itens');

        const first = await harness.call<ResultsBody>(account.token, 'POST', CONNECTIONS, {
            itemIds: [NUBANK, ITAU, MISSING, NUBANK.toUpperCase()]
        });

        expect(first.status).toBe(200);
        expect(first.body.results.map((result) => result.outcome)).toEqual(['connected', 'connected', 'not_found']);
        expect(JSON.stringify(first.body)).not.toContain(NUBANK);
        const again = await harness.call<ResultsBody>(account.token, 'POST', CONNECTIONS, { itemIds: [NUBANK] });
        expect(again.body.results.map((result) => result.outcome)).toEqual(['already_connected']);

        const connectionId: string = first.body.results[0]?.connection?.id ?? '';
        const message: PublishedMessage | undefined = messageOf(connectionId, 'initial');
        expect(message).toMatchObject({
            queue: 'vera-bank-connections',
            type: 'bank-connections.sync.requested',
            payload: { connectionId, companyId: account.company.id, trigger: 'initial' }
        });
        expect(message?.options?.jobId).toBe(
            `pluggy-sync-${connectionId}-initial-${new Date().toISOString().replace(/[-T:]/g, '').slice(0, 10)}`
        );
        expect(publisher.published.length).toBeGreaterThanOrEqual(2);
    });

    it('cria o item com LOGIN_ERROR como needs_attention', async () => {
        const account: Account = await withCredentials('login');

        const response = await harness.call<ResultsBody>(account.token, 'POST', CONNECTIONS, { itemIds: [LOGIN_ERROR] });

        expect(response.body.results[0]?.connection).toMatchObject({
            status: 'needs_attention',
            statusReason: 'login_error',
            connectorName: 'Banco Teste'
        });
    });

    it('recusa o segredo colado no campo de itens com 400 e sem eco', async () => {
        const account: Account = await withCredentials('campo');

        const response = await harness.call<{ type: string }>(account.token, 'POST', CONNECTIONS, { itemIds: [SECRET] });

        expect(response.status).toBe(400);
        expect(JSON.stringify(response.body)).not.toContain('sentinel');
    });

    it('lista credencial, conexões e contas vinculadas lendo só o banco', async () => {
        const account: Account = await withCredentials('lista');
        const connected = await harness.call<ResultsBody>(account.token, 'POST', CONNECTIONS, { itemIds: [NUBANK] });
        const connectionId: string = connected.body.results[0]?.connection?.id ?? '';
        const accounts: FinancialAccountService = harness.app.get(FinancialAccountService, { strict: false });
        const linked = await harness.inCompany(account.company.id, async () =>
            accounts.upsertProviderAccount({
                provider: 'pluggy',
                externalId: 'nubank-card',
                kind: 'credit_card',
                name: 'Nubank Cartão',
                numberLast4: '4321',
                currency: 'BRL'
            })
        );
        await harness.pg.query(
            'INSERT INTO "BankConnectionAccounts" ("id","companyId","connectionId","accountId","externalAccountId") VALUES (gen_random_uuid(),$1,$2,$3,$4)',
            [account.company.id, connectionId, linked.id, 'nubank-card']
        );
        await harness.pg.query(
            `INSERT INTO "BankSyncRuns" ("id","companyId","connectionId","trigger","status","inserted") VALUES (gen_random_uuid(),$1,$2,'initial','running',5)`,
            [account.company.id, connectionId]
        );

        const overview = await harness.call<OverviewBody>(account.token, 'GET', CONNECTIONS);

        expect(overview.body.credentials.configured).toBe(true);
        expect(overview.body.connections).toHaveLength(1);
        expect(overview.body.connections[0]).toMatchObject({
            connectorName: 'Nubank',
            syncing: true,
            accounts: [{ accountId: linked.id, name: 'Nubank Cartão', kind: 'credit_card', numberLast4: '4321' }],
            lastRun: { trigger: 'initial', status: 'running', inserted: 5 }
        });
    });

    it('desconecta sem apagar o histórico e com purge apaga as contas e as transações', async () => {
        const account: Account = await withCredentials('remover');
        const connected = await harness.call<ResultsBody>(account.token, 'POST', CONNECTIONS, { itemIds: [NUBANK, ITAU] });
        const first: string = connected.body.results[0]?.connection?.id ?? '';
        const second: string = connected.body.results[1]?.connection?.id ?? '';
        const accounts: FinancialAccountService = harness.app.get(FinancialAccountService, { strict: false });
        const keep = await harness.inCompany(account.company.id, async () =>
            accounts.upsertProviderAccount({ provider: 'pluggy', externalId: 'k1', kind: 'checking', name: 'Fica', currency: 'BRL' })
        );
        const purge = await harness.inCompany(account.company.id, async () =>
            accounts.upsertProviderAccount({ provider: 'pluggy', externalId: 'p1', kind: 'checking', name: 'Some', currency: 'BRL' })
        );
        for (const [connectionId, accountId, externalId] of [
            [first, keep.id, 'k1'],
            [second, purge.id, 'p1']
        ] as const) {
            await harness.pg.query(
                'INSERT INTO "BankConnectionAccounts" ("id","companyId","connectionId","accountId","externalAccountId") VALUES (gen_random_uuid(),$1,$2,$3,$4)',
                [account.company.id, connectionId, accountId, externalId]
            );
        }

        expect((await harness.call(account.token, 'DELETE', `${CONNECTIONS}/${first}`)).status).toBe(204);
        expect((await harness.call(account.token, 'DELETE', `${CONNECTIONS}/${first}`)).status).toBe(404);
        expect((await harness.call(account.token, 'DELETE', `${CONNECTIONS}/${second}?purgeTransactions=true`)).status).toBe(204);

        const states = await harness.pg.query<{ id: string; deletedAt: Date | null }>(
            'SELECT "id","deletedAt" FROM "FinancialAccounts" WHERE "companyId" = $1',
            [account.company.id]
        );
        expect(states.rows.find((row) => row.id === keep.id)?.deletedAt).toBeNull();
        expect(states.rows.find((row) => row.id === purge.id)?.deletedAt).not.toBeNull();
        expect((await harness.call<OverviewBody>(account.token, 'GET', CONNECTIONS)).body.connections).toEqual([]);
    });

    it('remover a credencial desconecta tudo e mantém o histórico por padrão', async () => {
        const account: Account = await withCredentials('credremove');
        await harness.call(account.token, 'POST', CONNECTIONS, { itemIds: [NUBANK] });
        const accounts: FinancialAccountService = harness.app.get(FinancialAccountService, { strict: false });
        const kept = await harness.inCompany(account.company.id, async () =>
            accounts.upsertProviderAccount({ provider: 'pluggy', externalId: 'c1', kind: 'checking', name: 'Histórico', currency: 'BRL' })
        );
        const connectionRow = await harness.pg.query<{ id: string }>('SELECT "id" FROM "BankConnections" WHERE "companyId" = $1', [
            account.company.id
        ]);
        await harness.pg.query(
            'INSERT INTO "BankConnectionAccounts" ("id","companyId","connectionId","accountId","externalAccountId") VALUES (gen_random_uuid(),$1,$2,$3,$4)',
            [account.company.id, connectionRow.rows[0]?.id, kept.id, 'c1']
        );

        expect((await harness.call(account.token, 'DELETE', CREDENTIALS)).status).toBe(204);

        const overview = await harness.call<OverviewBody>(account.token, 'GET', CONNECTIONS);
        expect(overview.body).toMatchObject({ credentials: { configured: false }, connections: [] });
        const remaining = await harness.pg.query('SELECT 1 FROM "FinancialAccounts" WHERE "id" = $1 AND "deletedAt" IS NULL', [kept.id]);
        expect(remaining.rowCount).toBe(1);
    });

    it('reativa as conexões pausadas ao trocar a credencial e publica credentials_rotated', async () => {
        const account: Account = await withCredentials('rotacao');
        const connected = await harness.call<ResultsBody>(account.token, 'POST', CONNECTIONS, { itemIds: [ITAU] });
        const connectionId: string = connected.body.results[0]?.connection?.id ?? '';
        await harness.pg.query(`UPDATE "BankConnections" SET "status" = 'paused', "statusReason" = 'credentials_invalid' WHERE "id" = $1`, [
            connectionId
        ]);

        await harness.call(account.token, 'PUT', CREDENTIALS, { clientId: CLIENT_ID, clientSecret: `${SECRET}-novo` });

        const overview = await harness.call<OverviewBody>(account.token, 'GET', CONNECTIONS);
        expect(overview.body.connections[0]).toMatchObject({ status: 'active', statusReason: null });
        expect(messageOf(connectionId, 'credentials_rotated')?.payload).toMatchObject({ connectionId, trigger: 'credentials_rotated' });
    });

    it('isola as companies: B não vê nem remove as conexões de A', async () => {
        const owner: Account = await withCredentials('dona');
        const outsider: Account = await harness.signUp('intrusa');
        const connected = await harness.call<ResultsBody>(owner.token, 'POST', CONNECTIONS, { itemIds: [NUBANK] });
        const connectionId: string = connected.body.results[0]?.connection?.id ?? '';

        const seen = await harness.call<OverviewBody>(outsider.token, 'GET', CONNECTIONS);
        const removed = await harness.call<{ type: string }>(outsider.token, 'DELETE', `${CONNECTIONS}/${connectionId}`);

        expect(seen.body.connections).toEqual([]);
        expect(removed).toMatchObject({ status: 404, body: { type: 'connections.connection_not_found' } });
        expect((await harness.call<OverviewBody>(owner.token, 'GET', CONNECTIONS)).body.connections).toHaveLength(1);
    });
});
