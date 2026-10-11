import { vi, afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppContext } from '../../src/core/context/app-context.port';
import { LogService } from '../../src/core/observability/log.service';
import { ConnectionSyncApplication } from '../../src/modules/bank-connections/application/connection-sync.application';
import { SyncFanoutApplication } from '../../src/modules/bank-connections/application/sync-fanout.application';
import { MOCK_ITEM_ITAU, MOCK_ITEM_NUBANK } from '../../src/modules/bank-connections/drivers/mock-pluggy-client.driver';
import { PluggyAuthRejectedError } from '../../src/modules/bank-connections/ports/pluggy-client.errors';
import { PluggyClientPort, PluggyItem } from '../../src/modules/bank-connections/ports/pluggy-client.port';
import { FinancialAccountService } from '../../src/modules/transactions/services/financial-account.service';
import { SpendingDataset, SpendingDatasetService } from '../../src/modules/transactions/services/spending-dataset.service';
import { TransactionIngestionService } from '../../src/modules/transactions/services/transaction-ingestion.service';
import { DateUtil } from '../../src/shared/utils/date.util';
import { Account, AllocationHarness } from './support/allocation-harness';
import { CapturingPublisher, PublishedMessage } from './support/queue';

const CLIENT_ID: string = '3f9a1b2c-4d5e-4f60-8a9b-c2e1d3f4a5b6';
const SECRET: string = 'vera-sentinel-1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const CREDENTIALS: string = '/spending/connections/credentials';
const CONNECTIONS: string = '/spending/connections';
const NUBANK: string = MOCK_ITEM_NUBANK;
const ITAU: string = MOCK_ITEM_ITAU;
const SYNC_TYPE: string = 'bank-connections.sync.requested';

interface ConnectionBody {
    readonly id: string;
    readonly status: string;
    readonly statusReason: string | null;
    readonly syncing: boolean;
    readonly lastSyncAt: string | null;
    readonly lastSuccessAt: string | null;
    readonly accounts: { name: string; kind: string; numberLast4: string | null }[];
    readonly lastRun: { trigger: string; status: string; inserted: number; failureCode: string | null } | null;
}

interface OverviewBody {
    readonly connections: ConnectionBody[];
}

interface ResultsBody {
    readonly results: { outcome: string; connection: ConnectionBody | null }[];
}

interface ProblemBody {
    readonly type: string;
}

interface SummaryBody {
    readonly month: string;
    readonly expensesMinor: number;
    readonly income: { minor: number };
    readonly categories: { systemKey: string | null; spentMinor: number }[];
}

interface TransactionRow {
    readonly externalId: string;
    readonly amountMinor: string;
    readonly accountName: string;
}

interface SyncPayload {
    readonly connectionId: string;
    readonly companyId: string;
    readonly trigger: string;
}

describe('bank connections sync', () => {
    const publisher: CapturingPublisher = new CapturingPublisher();
    let harness: AllocationHarness;
    let sync: ConnectionSyncApplication;
    let fanout: SyncFanoutApplication;
    let client: PluggyClientPort;
    let dataset: SpendingDataset;

    beforeAll(async () => {
        harness = await AllocationHarness.start('bank_sync', publisher);
        sync = harness.app.get(ConnectionSyncApplication, { strict: false });
        fanout = harness.app.get(SyncFanoutApplication, { strict: false });
        client = harness.app.get(PluggyClientPort, { strict: false });
        dataset = new SpendingDatasetService().build(DateUtil.todayInBrazil());
    });

    afterAll(async () => {
        vi.restoreAllMocks();
        await harness.stop();
    });

    async function withCredentials(label: string): Promise<Account> {
        const account: Account = await harness.signUp(label);
        await harness.call(account.token, 'PUT', CREDENTIALS, { clientId: CLIENT_ID, clientSecret: SECRET });
        return account;
    }

    async function connect(account: Account, itemIds: string[]): Promise<string[]> {
        const response = await harness.call<ResultsBody>(account.token, 'POST', CONNECTIONS, { itemIds });
        return response.body.results.map((result) => result.connection?.id ?? '');
    }

    function messagesOf(trigger: string, companyId: string): PublishedMessage[] {
        return publisher.published.filter((message) => {
            const payload: SyncPayload = message.payload as SyncPayload;
            return message.type === SYNC_TYPE && payload.trigger === trigger && payload.companyId === companyId;
        });
    }

    async function process(messages: readonly PublishedMessage[]): Promise<void> {
        for (const message of messages) {
            await runAsWorker(async () => sync.handle(message.payload));
        }
    }

    async function runAsWorker<T>(work: () => Promise<T>): Promise<T> {
        return harness.app.get(AppContext).run({ requestId: 'worker', locale: 'pt-BR' }, work);
    }

    async function overview(account: Account): Promise<ConnectionBody[]> {
        return (await harness.call<OverviewBody>(account.token, 'GET', CONNECTIONS)).body.connections;
    }

    async function transactionRows(account: Account): Promise<TransactionRow[]> {
        const result = await harness.pg.query<TransactionRow>(
            `SELECT t."externalId", t."amountMinor", a."name" AS "accountName"
               FROM "Transactions" t JOIN "FinancialAccounts" a ON a."id" = t."accountId"
              WHERE t."companyId" = $1 AND t."deletedAt" IS NULL`,
            [account.company.id]
        );
        return result.rows;
    }

    async function summary(account: Account): Promise<SummaryBody> {
        const response = await harness.call<SummaryBody>(account.token, 'GET', '/spending/summary');
        expect(response.status).toBe(200);
        return response.body;
    }

    async function loadDirectly(account: Account): Promise<void> {
        const accounts: FinancialAccountService = harness.app.get(FinancialAccountService, { strict: false });
        const ingestion: TransactionIngestionService = harness.app.get(TransactionIngestionService, { strict: false });
        for (const spec of dataset.accounts) {
            const created = await harness.inCompany(account.company.id, async () =>
                accounts.upsertProviderAccount({
                    provider: 'pluggy',
                    externalId: `direct-${spec.key}`,
                    kind: spec.kind,
                    name: spec.name,
                    institutionName: spec.institutionName,
                    numberLast4: spec.numberLast4,
                    currency: spec.currency
                })
            );
            const items = dataset.transactions
                .filter((transaction) => transaction.accountKey === spec.key)
                .map((transaction) => ({
                    externalId: `pluggy:direct-${transaction.key}`,
                    date: transaction.date,
                    amountMinor: transaction.amountMinor,
                    currency: 'BRL',
                    description: transaction.description,
                    counterpartyName: transaction.counterpartyName,
                    counterpartyDocument: transaction.counterpartyDocument,
                    providerCategoryId: transaction.providerCategoryId
                }));
            await harness.inCompany(account.company.id, async () =>
                ingestion.ingest({ accountId: created.id, source: 'pluggy', importId: null, items })
            );
        }
    }

    it('conecta as duas contas do mock, processa os jobs e entrega o conjunto canônico com o cartão negativo', async () => {
        const account: Account = await withCredentials('canonico');
        const control: Account = await harness.signUp('controle');
        await loadDirectly(control);

        await connect(account, [NUBANK, ITAU]);
        await process(messagesOf('initial', account.company.id));

        const connections: ConnectionBody[] = await overview(account);
        expect(connections.map((connection) => connection.accounts.map((entry) => entry.name).sort())).toEqual([
            ['Nubank Cartão', 'Nubank Conta'],
            ['Itaú Conta Corrente']
        ]);
        expect(connections.every((connection) => connection.status === 'active' && !connection.syncing)).toBe(true);
        expect(connections.every((connection) => connection.lastRun?.status === 'succeeded')).toBe(true);
        expect(connections.every((connection) => connection.lastSuccessAt !== null)).toBe(true);
        const rows: TransactionRow[] = await transactionRows(account);
        expect(rows).toHaveLength(dataset.transactions.length);
        const netflix = rows.find((row) => row.externalId.endsWith(':nubank-card:netflix') && row.accountName === 'Nubank Cartão');
        expect(Number(netflix?.amountMinor)).toBe(-5590);
        const strip = (_key: string, value: unknown): unknown => (_key === 'id' || _key === 'categoryId' ? undefined : value);
        expect(JSON.stringify(await summary(account), strip)).toBe(JSON.stringify(await summary(control), strip));
        const closed = dataset.transactions.filter((transaction) => transaction.month === dataset.closedMonth);
        expect(closed.length).toBeGreaterThan(0);
        expect((await summary(account)).month).toBe(dataset.closedMonth);
    });

    it('rodar o tick duas vezes no mesmo dia dá um job por conexão e a segunda rodada não traz nada novo', async () => {
        const account: Account = await withCredentials('tick');
        await connect(account, [NUBANK, ITAU]);
        await process(messagesOf('initial', account.company.id));
        const before: number = (await transactionRows(account)).length;
        publisher.published.length = 0;

        await runAsWorker(async () => fanout.handleTick());
        const first: PublishedMessage[] = messagesOf('daily', account.company.id);
        await runAsWorker(async () => fanout.handleTick());
        const both: PublishedMessage[] = messagesOf('daily', account.company.id);

        expect(first).toHaveLength(2);
        expect(both.map((message) => message.options?.jobId)).toEqual([
            first[0]?.options?.jobId,
            first[1]?.options?.jobId,
            first[0]?.options?.jobId,
            first[1]?.options?.jobId
        ]);
        const everyone: PublishedMessage[] = publisher.published.filter(
            (message) => message.type === SYNC_TYPE && (message.payload as SyncPayload).trigger === 'daily'
        );
        const firstTickSize: number = everyone.length / 2;
        expect(everyone.slice(0, firstTickSize).map((message) => message.options?.delayMs)).toEqual(
            Array.from({ length: firstTickSize }, (_unused, index) => index * 2000)
        );
        await process(first);
        expect((await transactionRows(account)).length).toBe(before);
        const connections: ConnectionBody[] = await overview(account);
        expect(connections.every((connection) => connection.lastRun?.trigger === 'daily' && connection.lastRun.inserted === 0)).toBe(true);
    });

    it('sincronizar agora responde 202 e uma segunda chamada com a primeira rodando devolve 409', async () => {
        const account: Account = await withCredentials('manual');
        const [connectionId] = await connect(account, [NUBANK]);
        await process(messagesOf('initial', account.company.id));
        publisher.published.length = 0;
        const path: string = `${CONNECTIONS}/${connectionId ?? ''}/sync`;
        let release: () => void = () => undefined;
        const gate: Promise<void> = new Promise<void>((resolve) => {
            release = resolve;
        });
        const original = client.getItem.bind(client);
        vi.spyOn(client, 'getItem').mockImplementation(async (session, itemId): Promise<PluggyItem | null> => {
            await gate;
            return original(session, itemId);
        });

        const first = await harness.call<{ queued: boolean }>(account.token, 'POST', path);
        const running: Promise<void> = process(messagesOf('manual', account.company.id));
        await vi.waitFor(async () => {
            expect((await overview(account))[0]?.syncing).toBe(true);
        });
        const second = await harness.call<ProblemBody>(account.token, 'POST', path);
        release();
        await running;
        vi.restoreAllMocks();

        expect(first).toMatchObject({ status: 202, body: { queued: true } });
        expect(second).toMatchObject({ status: 409, body: { type: 'connections.sync_in_progress' } });
        expect((await overview(account))[0]?.syncing).toBe(false);
        const all = await harness.call<{ queued: number }>(account.token, 'POST', `${CONNECTIONS}/sync`);
        expect(all).toMatchObject({ status: 202, body: { queued: 1 } });
    });

    it('limita a sincronização manual a 3 por conexão em 10 minutos', async () => {
        const account: Account = await withCredentials('limite');
        const [connectionId] = await connect(account, [NUBANK]);
        const path: string = `${CONNECTIONS}/${connectionId ?? ''}/sync`;

        const statuses: number[] = [];
        for (let attempt = 0; attempt < 4; attempt += 1) {
            statuses.push((await harness.call(account.token, 'POST', path)).status);
        }

        expect(statuses).toEqual([202, 202, 202, 429]);
    });

    it('credencial recusada pausa as conexões e a troca da credencial as reativa e enfileira a sincronização', async () => {
        const account: Account = await withCredentials('pausa');
        await connect(account, [NUBANK, ITAU]);
        vi.spyOn(client, 'authenticate').mockRejectedValueOnce(new PluggyAuthRejectedError());

        await process(messagesOf('initial', account.company.id).slice(0, 1));

        const paused: ConnectionBody[] = await overview(account);
        expect(paused.map((connection) => [connection.status, connection.statusReason])).toEqual([
            ['paused', 'credentials_invalid'],
            ['paused', 'credentials_invalid']
        ]);
        expect(paused[0]?.lastRun).toMatchObject({ status: 'failed', failureCode: 'invalid_credentials' });
        vi.restoreAllMocks();
        const refused = await harness.call<ProblemBody>(account.token, 'POST', `${CONNECTIONS}/${paused[0]?.id ?? ''}/sync`);
        expect(refused.body.type).toBe('connections.invalid_credentials');

        await harness.call(account.token, 'PUT', CREDENTIALS, { clientId: CLIENT_ID, clientSecret: `${SECRET}-novo` });
        const rotated: PublishedMessage[] = messagesOf('credentials_rotated', account.company.id);
        await process(rotated);

        expect(rotated).toHaveLength(2);
        expect((await overview(account)).map((connection) => [connection.status, connection.lastRun?.status])).toEqual([
            ['active', 'succeeded'],
            ['active', 'succeeded']
        ]);
    });

    it('item que sumiu depois de conectado vira revoked e a sincronização manual pede reautorizar', async () => {
        const account: Account = await withCredentials('revogado');
        const ids: string[] = await connect(account, [NUBANK, ITAU]);
        await process(messagesOf('initial', account.company.id));
        const original = client.getItem.bind(client);
        vi.spyOn(client, 'getItem').mockImplementation(async (session, itemId): Promise<PluggyItem | null> =>
            itemId === ITAU ? null : original(session, itemId)
        );

        await process(messagesOf('initial', account.company.id));
        vi.restoreAllMocks();

        const connections: ConnectionBody[] = await overview(account);
        expect(connections.map((connection) => [connection.status, connection.statusReason])).toEqual([
            ['active', null],
            ['revoked', 'item_not_found']
        ]);
        expect(connections[1]?.lastRun).toMatchObject({ status: 'failed', failureCode: 'item_not_found' });
        const refused = await harness.call<ProblemBody>(account.token, 'POST', `${CONNECTIONS}/${ids[1] ?? ''}/sync`);
        expect(refused).toMatchObject({ status: 422, body: { type: 'connections.item_not_found' } });
        publisher.published.length = 0;
        await runAsWorker(async () => fanout.handleTick());
        expect(messagesOf('daily', account.company.id).map((message) => (message.payload as SyncPayload).connectionId)).toEqual([ids[0]]);
    });

    it('sem credencial a rota de sincronizar devolve credentials_missing e conexão inexistente devolve 404', async () => {
        const account: Account = await harness.signUp('semcred');

        const all = await harness.call<ProblemBody>(account.token, 'POST', `${CONNECTIONS}/sync`);
        const one = await harness.call<ProblemBody>(account.token, 'POST', `${CONNECTIONS}/${crypto.randomUUID()}/sync`);
        const unauthenticated = await harness.call(null, 'POST', `${CONNECTIONS}/sync`);

        expect(all).toMatchObject({ status: 422, body: { type: 'connections.credentials_missing' } });
        expect(one).toMatchObject({ status: 404, body: { type: 'connections.connection_not_found' } });
        expect(unauthenticated.status).toBe(401);
    });

    it('isola as companies: job com a conexão de A e a company de B não executa nada', async () => {
        const owner: Account = await withCredentials('isola-a');
        const outsider: Account = await withCredentials('isola-b');
        const [ownerConnection] = await connect(owner, [NUBANK]);
        await connect(outsider, [ITAU]);
        const error = vi.spyOn(harness.app.get(LogService, { strict: false }), 'error');

        await runAsWorker(async () => sync.handle({ connectionId: ownerConnection, companyId: outsider.company.id, trigger: 'daily' }));

        expect(error).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ reason: 'company_mismatch' }) }));
        expect(await transactionRows(owner)).toHaveLength(0);
        expect(await transactionRows(outsider)).toHaveLength(0);
        expect((await overview(owner))[0]?.lastRun).toBeNull();
        error.mockRestore();

        await process(messagesOf('initial', owner.company.id));
        await process(messagesOf('initial', outsider.company.id));

        const ownerRows: TransactionRow[] = await transactionRows(owner);
        const outsiderRows: TransactionRow[] = await transactionRows(outsider);
        expect(ownerRows.length).toBeGreaterThan(0);
        expect(outsiderRows.length).toBeGreaterThan(0);
        expect(ownerRows.some((row) => row.accountName === 'Itaú Conta Corrente')).toBe(false);
        expect(outsiderRows.some((row) => row.accountName.startsWith('Nubank'))).toBe(false);
        const listed = await harness.call<{ data: { accountName: string }[] }>(
            outsider.token,
            'GET',
            `/spending/transactions?month=${dataset.closedMonth}`
        );
        expect(listed.body.data.length).toBeGreaterThan(0);
        expect(listed.body.data.every((entry) => entry.accountName === 'Itaú Conta Corrente')).toBe(true);
    });

    it('o tick processa cada conexão como a company da própria linha', async () => {
        const first: Account = await withCredentials('tick-a');
        const second: Account = await withCredentials('tick-b');
        await connect(first, [NUBANK]);
        await connect(second, [ITAU]);
        publisher.published.length = 0;

        await runAsWorker(async () => fanout.handleTick());
        await process(publisher.published.filter((message) => message.type === SYNC_TYPE));

        expect((await transactionRows(first)).every((row) => row.accountName.startsWith('Nubank'))).toBe(true);
        expect((await transactionRows(second)).every((row) => row.accountName === 'Itaú Conta Corrente')).toBe(true);
        expect((await overview(first))[0]?.lastRun?.trigger).toBe('daily');
    });
});
