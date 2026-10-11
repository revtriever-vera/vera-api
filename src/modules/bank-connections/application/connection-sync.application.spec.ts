import { describe, expect, it, vi } from 'vitest';
import { buildSyncFixture, COMPANY_ID, connectionOf, SyncFixture } from '../../../../test/support/bank-sync-fakes';
import { CLIENT_ID, ITEM_LOGIN_ERROR, ITEM_NUBANK, SENTINEL } from '../../../../test/support/bank-connections-fakes';
import { BankSyncRun } from '../domain/bank-connections.types';
import { addDays } from '../domain/date-math';
import { PluggyAuthRejectedError, PluggyUnavailableError } from '../ports/pluggy-client.errors';
import { PluggyTransaction } from '../ports/pluggy-client.port';
import { SpendingDatasetService } from '../../transactions/services/spending-dataset.service';

async function seeded(items: string[] = [ITEM_NUBANK], overrides: Parameters<typeof buildSyncFixture>[1] = {}): Promise<SyncFixture> {
    const fixture: SyncFixture = buildSyncFixture({}, overrides);
    await fixture.credentialsApplication.save({ clientId: CLIENT_ID, clientSecret: SENTINEL });
    await fixture.connectionsApplication.connect(items);
    return fixture;
}

function payloadOf(fixture: SyncFixture, index: number = 0, trigger: string = 'daily'): unknown {
    return { connectionId: connectionOf(fixture, index).id, companyId: COMPANY_ID, trigger };
}

function pending(id: string): PluggyTransaction {
    return {
        id,
        accountId: 'nubank-checking',
        date: '2026-10-01',
        description: 'PENDENTE',
        descriptionRaw: null,
        amount: -1,
        currencyCode: 'BRL',
        amountInAccountCurrency: null,
        status: 'PENDING',
        categoryId: null,
        paymentData: null,
        merchant: null,
        installmentNumber: null,
        installmentTotal: null
    };
}

function runsOf(fixture: SyncFixture): BankSyncRun[] {
    return fixture.runs.rows;
}

describe('ConnectionSyncApplication', () => {
    it('sincroniza as contas e as transações do conjunto canônico com o sinal do usuário', async () => {
        const fixture: SyncFixture = await seeded();

        const directive = await fixture.syncApplication.handle(payloadOf(fixture));

        expect(directive).toEqual({ retryAfterSeconds: null, failure: null });
        expect([...fixture.financialAccounts.rows.keys()].sort()).toEqual(['nubank-card', 'nubank-checking']);
        expect(fixture.financialAccounts.rows.get('nubank-card')).toMatchObject({ kind: 'credit_card', numberLast4: '4321' });
        const dataset = new SpendingDatasetService().build(fixture.today.value);
        const expected = dataset.transactions.filter((transaction) => transaction.accountKey.startsWith('nubank'));
        const received = new Map(fixture.ingestion.items().map((item) => [item.externalId, item.amountMinor]));
        expect(received.size).toBe(expected.length);
        for (const transaction of expected) {
            expect(received.get(`pluggy:mock-${transaction.key}`)).toBe(transaction.amountMinor);
        }
        expect(expected.some((transaction) => transaction.accountKey === 'nubank-card' && transaction.amountMinor < 0)).toBe(true);
        expect(runsOf(fixture)).toHaveLength(1);
        expect(runsOf(fixture)[0]).toMatchObject({
            trigger: 'daily',
            status: 'succeeded',
            accounts: 2,
            fetched: expected.length,
            inserted: expected.length,
            failureCode: null
        });
        expect(runsOf(fixture)[0]?.finishedAt).not.toBeNull();
        expect(connectionOf(fixture)).toMatchObject({ lastSyncAt: expect.any(Date), lastSuccessAt: expect.any(Date) });
    });

    it('na segunda vez volta só 7 dias, não insere nada novo e mantém uma execução por rodada', async () => {
        const fixture: SyncFixture = await seeded();
        await fixture.syncApplication.handle(payloadOf(fixture));
        const listTransactions = vi.spyOn(fixture.client, 'listTransactions');

        await fixture.syncApplication.handle(payloadOf(fixture));

        expect(runsOf(fixture)).toHaveLength(2);
        expect(runsOf(fixture)[1]).toMatchObject({ status: 'succeeded', inserted: 0 });
        const firstCall = listTransactions.mock.calls[0]?.[1];
        expect(firstCall).toMatchObject({ from: addDays(fixture.today.value, -7), to: fixture.today.value });
    });

    it('percorre todas as páginas do cartão antes de avançar a janela', async () => {
        const fixture: SyncFixture = await seeded();

        await fixture.syncApplication.handle(payloadOf(fixture));

        const cardBatches = fixture.ingestion.batches.filter((batch) => batch.accountId === 'account-nubank-card');
        expect(cardBatches.length).toBeGreaterThan(1);
        expect(fixture.links.rows.every((link) => link.syncedThrough !== null)).toBe(true);
    });

    it('não executa quando o companyId do payload diverge do da conexão', async () => {
        const fixture: SyncFixture = await seeded();
        const authenticate = vi.spyOn(fixture.client, 'authenticate');

        const directive = await fixture.syncApplication.handle({
            ...(payloadOf(fixture) as object),
            companyId: '00000000-0000-4000-8000-0000000000ff'
        });

        expect(directive.failure).toBeNull();
        expect(authenticate).not.toHaveBeenCalled();
        expect(runsOf(fixture)).toHaveLength(0);
        expect(JSON.stringify(fixture.logEntries)).toContain('company_mismatch');
    });

    it('descarta payload inválido e conexão inexistente sem efeito', async () => {
        const fixture: SyncFixture = await seeded();
        const authenticate = vi.spyOn(fixture.client, 'authenticate');

        await fixture.syncApplication.handle({ connectionId: 'não-uuid' });
        await fixture.syncApplication.handle({ connectionId: crypto.randomUUID(), companyId: COMPANY_ID, trigger: 'daily' });

        expect(authenticate).not.toHaveBeenCalled();
        expect(runsOf(fixture)).toHaveLength(0);
        expect(JSON.stringify(fixture.logEntries)).toContain('invalid_payload');
        expect(JSON.stringify(fixture.logEntries)).toContain('connection_not_found');
    });

    it('ignora conexão pausada ou revogada', async () => {
        const fixture: SyncFixture = await seeded();
        fixture.connections.setStatus(connectionOf(fixture).id, 'paused');

        await fixture.syncApplication.handle(payloadOf(fixture));
        fixture.connections.setStatus(connectionOf(fixture).id, 'revoked');
        await fixture.syncApplication.handle(payloadOf(fixture));

        expect(runsOf(fixture)).toHaveLength(0);
    });

    it('credencial recusada pausa todas as conexões da company e a execução falha sem nova tentativa', async () => {
        const fixture: SyncFixture = await seeded([ITEM_NUBANK, ITEM_LOGIN_ERROR]);
        vi.spyOn(fixture.client, 'authenticate').mockRejectedValue(new PluggyAuthRejectedError());

        const directive = await fixture.syncApplication.handle(payloadOf(fixture));

        expect(directive).toEqual({ retryAfterSeconds: null, failure: null });
        expect(fixture.connections.rows.map((row) => [row.status, row.statusReason])).toEqual([
            ['paused', 'credentials_invalid'],
            ['paused', 'credentials_invalid']
        ]);
        expect(fixture.credentials.rows[0]).toMatchObject({ status: 'invalid' });
        expect(runsOf(fixture)[0]).toMatchObject({ status: 'failed', failureCode: 'invalid_credentials' });
        expect(connectionOf(fixture).lastSuccessAt).toBeNull();
    });

    it('401 depois do authenticate (item, contas ou transações) também marca a credencial inválida e pausa tudo', async () => {
        const calls: ('getItem' | 'listAccounts' | 'listTransactions')[] = ['getItem', 'listAccounts', 'listTransactions'];
        for (const call of calls) {
            const fixture: SyncFixture = await seeded([ITEM_NUBANK, ITEM_LOGIN_ERROR]);
            vi.spyOn(fixture.client, call).mockRejectedValue(new PluggyAuthRejectedError());

            await fixture.syncApplication.handle(payloadOf(fixture));

            expect(fixture.credentials.rows[0]).toMatchObject({ status: 'invalid', lastErrorCode: 'invalid_credentials' });
            expect(fixture.connections.rows.map((row) => row.status)).toEqual(['paused', 'paused']);
            expect(runsOf(fixture)[0]).toMatchObject({ status: 'failed', failureCode: 'invalid_credentials' });
        }
    });

    it('credencial já marcada inválida também pausa sem chamar a Pluggy', async () => {
        const fixture: SyncFixture = await seeded();
        await fixture.vault.markInvalid('invalid_credentials');
        const authenticate = vi.spyOn(fixture.client, 'authenticate');

        await fixture.syncApplication.handle(payloadOf(fixture));

        expect(authenticate).not.toHaveBeenCalled();
        expect(connectionOf(fixture)).toMatchObject({ status: 'paused', statusReason: 'credentials_invalid' });
    });

    it('sem credencial pausa só a conexão com credentials_missing', async () => {
        const fixture: SyncFixture = await seeded([ITEM_NUBANK, ITEM_LOGIN_ERROR]);
        await fixture.vault.remove();

        await fixture.syncApplication.handle(payloadOf(fixture));

        expect(connectionOf(fixture, 0)).toMatchObject({ status: 'paused', statusReason: 'credentials_missing' });
        expect(connectionOf(fixture, 1).status).toBe('needs_attention');
        expect(runsOf(fixture)[0]).toMatchObject({ status: 'failed', failureCode: 'credentials_missing' });
    });

    it('item que sumiu vira revoked/item_not_found e a execução termina', async () => {
        const fixture: SyncFixture = await seeded();
        vi.spyOn(fixture.client, 'getItem').mockResolvedValue(null);

        await fixture.syncApplication.handle(payloadOf(fixture));

        expect(connectionOf(fixture)).toMatchObject({ status: 'revoked', statusReason: 'item_not_found' });
        expect(runsOf(fixture)[0]).toMatchObject({ status: 'failed', failureCode: 'item_not_found' });
        expect(fixture.ingestion.batches).toHaveLength(0);
    });

    it('atualiza o estado da conexão a partir do item e continua a sincronização', async () => {
        const fixture: SyncFixture = await seeded([ITEM_LOGIN_ERROR]);
        vi.spyOn(fixture.client, 'getItem').mockResolvedValue({
            id: ITEM_LOGIN_ERROR,
            status: 'UPDATED',
            executionStatus: 'SUCCESS',
            connectorName: 'Banco Novo',
            lastUpdatedAt: new Date(),
            consentExpiresAt: new Date('2027-01-01T00:00:00Z')
        });

        await fixture.syncApplication.handle(payloadOf(fixture));

        expect(connectionOf(fixture)).toMatchObject({
            status: 'active',
            statusReason: null,
            providerStatus: 'UPDATED',
            connectorName: 'Banco Novo'
        });
        expect(runsOf(fixture)[0]).toMatchObject({ status: 'succeeded', accounts: 0 });
    });

    it('conta que falha dá partial e não avança o syncedThrough dela', async () => {
        const fixture: SyncFixture = await seeded();
        fixture.ingestion.failForAccount = new Set(['account-nubank-card']);

        await fixture.syncApplication.handle(payloadOf(fixture));

        expect(runsOf(fixture)[0]).toMatchObject({ status: 'partial', failureCode: 'account_failed' });
        const byAccount = new Map(fixture.links.rows.map((link) => [link.externalAccountId, link.syncedThrough]));
        expect(byAccount.get('nubank-card')).toBeNull();
        expect(byAccount.get('nubank-checking')).not.toBeNull();
        expect(connectionOf(fixture).lastSuccessAt).not.toBeNull();
        expect(JSON.stringify(fixture.logEntries)).toContain('account_failed');
    });

    it('com todas as contas falhando a execução falha e a conexão não ganha lastSuccessAt', async () => {
        const fixture: SyncFixture = await seeded();
        fixture.ingestion.failForAccount = new Set(['account-nubank-card', 'account-nubank-checking']);

        await fixture.syncApplication.handle(payloadOf(fixture));

        expect(runsOf(fixture)[0]).toMatchObject({ status: 'failed', failureCode: 'account_failed' });
        expect(connectionOf(fixture)).toMatchObject({ lastSuccessAt: null, lastSyncAt: expect.any(Date) });
    });

    it('conta que não consegue ser criada conta como falha e as outras seguem', async () => {
        const fixture: SyncFixture = await seeded();
        fixture.financialAccounts.failFor = new Set(['nubank-card']);

        await fixture.syncApplication.handle(payloadOf(fixture));

        expect(runsOf(fixture)[0]).toMatchObject({ status: 'partial', accounts: 1 });
    });

    it('corta a paginação que nunca termina e trata como falha da conta', async () => {
        const fixture: SyncFixture = await seeded();
        vi.spyOn(fixture.client, 'listTransactions').mockResolvedValue({ items: [], next: 'sempre' });

        await fixture.syncApplication.handle(payloadOf(fixture));

        expect(runsOf(fixture)[0]).toMatchObject({ status: 'failed', failureCode: 'account_failed' });
        expect(fixture.links.rows.every((link) => link.syncedThrough === null)).toBe(true);
    });

    it('429 pede nova tentativa com o atraso informado e deixa a conexão ativa', async () => {
        const fixture: SyncFixture = await seeded();
        const limited: PluggyUnavailableError = new PluggyUnavailableError('rate_limited', 429, 90);
        vi.spyOn(fixture.client, 'listAccounts').mockRejectedValue(limited);

        const directive = await fixture.syncApplication.handle(payloadOf(fixture));

        expect(directive).toEqual({ retryAfterSeconds: 90, failure: limited });
        expect(runsOf(fixture)[0]).toMatchObject({ status: 'failed', failureCode: 'rate_limited' });
        expect(connectionOf(fixture)).toMatchObject({ status: 'active', lastSuccessAt: null });
    });

    it('429 no meio das transações interrompe a execução em vez de virar partial', async () => {
        const fixture: SyncFixture = await seeded();
        vi.spyOn(fixture.client, 'listTransactions').mockRejectedValue(new PluggyUnavailableError('rate_limited', 429, 30));

        const directive = await fixture.syncApplication.handle(payloadOf(fixture));

        expect(directive.retryAfterSeconds).toBe(30);
        expect(runsOf(fixture)[0]).toMatchObject({ status: 'failed', failureCode: 'rate_limited' });
    });

    it('Pluggy fora do ar devolve a falha para a fila tentar de novo com o backoff', async () => {
        const fixture: SyncFixture = await seeded();
        const down: PluggyUnavailableError = new PluggyUnavailableError('server_error', 503, null);
        vi.spyOn(fixture.client, 'getItem').mockRejectedValue(down);

        const directive = await fixture.syncApplication.handle(payloadOf(fixture));

        expect(directive).toEqual({ retryAfterSeconds: null, failure: down });
        expect(runsOf(fixture)[0]).toMatchObject({ status: 'failed', failureCode: 'provider_unavailable' });
    });

    it('erro inesperado fecha a execução como failed e é devolvido', async () => {
        const fixture: SyncFixture = await seeded();
        const boom: Error = new Error('boom');
        vi.spyOn(fixture.client, 'getItem').mockRejectedValue(boom);

        const directive = await fixture.syncApplication.handle(payloadOf(fixture));

        expect(directive.failure).toBe(boom);
        expect(runsOf(fixture)[0]).toMatchObject({ status: 'failed', failureCode: 'unexpected' });
    });

    it('ignora as pendentes e as conta no log, sem nome nem valor', async () => {
        const fixture: SyncFixture = await seeded();
        vi.spyOn(fixture.client, 'listTransactions').mockResolvedValue({ items: [pending('p1'), pending('p2')], next: null });

        await fixture.syncApplication.handle(payloadOf(fixture));

        expect(fixture.ingestion.batches).toHaveLength(0);
        const finished = fixture.logEntries.find((entry) => (entry as { identifier: string }).identifier === 'bank-connections-sync') as {
            meta: Record<string, unknown>;
        };
        expect(finished.meta).toMatchObject({ skippedPending: 4, fetched: 4, inserted: 0, status: 'succeeded', trigger: 'daily' });
        expect(Object.keys(finished.meta).sort()).toEqual(
            [
                'accounts',
                'connectionId',
                'duplicates',
                'durationMs',
                'failureCode',
                'fetched',
                'inserted',
                'runId',
                'skippedPending',
                'status',
                'trigger',
                'updated'
            ].sort()
        );
    });

    it('registra as métricas da execução', async () => {
        const fixture: SyncFixture = await seeded();

        await fixture.syncApplication.handle(payloadOf(fixture, 0, 'manual'));

        expect(fixture.metricEntries).toContainEqual(['vera_pluggy_sync_total', { trigger: 'manual', result: 'succeeded' }]);
        expect(fixture.metricEntries.some((entry) => (entry as unknown[])[0] === 'vera_pluggy_sync_duration_seconds')).toBe(true);
        expect(fixture.metricEntries.some((entry) => (entry as unknown[])[0] === 'vera_pluggy_transactions_fetched_total')).toBe(true);
    });

    it('interrompe a execução esquecida em running antes de abrir a nova e guarda só as 30 últimas', async () => {
        const fixture: SyncFixture = await seeded();
        const connection = connectionOf(fixture);
        const stale: BankSyncRun = await fixture.runs.begin(connection.id, 'daily');
        fixture.runs.rows = fixture.runs.rows.map((row) =>
            row.id === stale.id ? { ...row, startedAt: new Date(Date.now() - 2 * 3_600_000) } : row
        );
        for (let index = 0; index < 33; index += 1) {
            const run: BankSyncRun = await fixture.runs.begin(connection.id, 'daily');
            await fixture.runs.conclude(run.id, 'succeeded', { accounts: 0, fetched: 0, inserted: 0, updated: 0, duplicates: 0 }, null);
        }

        await fixture.syncApplication.handle(payloadOf(fixture));

        expect(fixture.runs.rows).toHaveLength(30);
        expect(fixture.runs.rows.some((row) => row.id === stale.id)).toBe(false);
    });

    it('marca a execução esquecida como interrompida', async () => {
        const fixture: SyncFixture = await seeded();
        const connection = connectionOf(fixture);
        const stale: BankSyncRun = await fixture.runs.begin(connection.id, 'daily');
        fixture.runs.rows = fixture.runs.rows.map((row) =>
            row.id === stale.id ? { ...row, startedAt: new Date(Date.now() - 2 * 3_600_000) } : row
        );

        await fixture.runDomain.begin(connection.id, 'manual');

        expect(fixture.runs.rows.find((row) => row.id === stale.id)).toMatchObject({ status: 'failed', failureCode: 'interrupted' });
    });
});
