import { describe, expect, it, vi } from 'vitest';
import {
    buildFixture,
    CLIENT_ID,
    Fixture,
    ITEM_ITAU,
    ITEM_LOGIN_ERROR,
    ITEM_MISSING,
    ITEM_NUBANK,
    SENTINEL
} from '../../../../test/support/bank-connections-fakes';
import { PluggyAuthRejectedError, PluggyUnavailableError } from '../ports/pluggy-client.errors';

async function withCredentials(options: Parameters<typeof buildFixture>[0] = {}): Promise<Fixture> {
    const fixture: Fixture = buildFixture(options);
    await fixture.credentialsApplication.save({ clientId: CLIENT_ID, clientSecret: SENTINEL });
    return fixture;
}

describe('ConnectionsApplication', () => {
    it('sem credencial devolve credentials_missing', async () => {
        const fixture: Fixture = buildFixture();

        await expect(fixture.connectionsApplication.connect([ITEM_NUBANK])).rejects.toMatchObject({ code: 'connections.credentials_missing' });
    });

    it('com a credencial marcada inválida devolve invalid_credentials sem chamar a Pluggy', async () => {
        const fixture: Fixture = await withCredentials();
        await fixture.vault.markInvalid('invalid_credentials');
        const authenticate = vi.spyOn(fixture.client, 'authenticate');

        await expect(fixture.connectionsApplication.connect([ITEM_NUBANK])).rejects.toMatchObject({ code: 'connections.invalid_credentials' });

        expect(authenticate).not.toHaveBeenCalled();
    });

    it('se a Pluggy passa a recusar a credencial guardada, marca invalid e devolve 422', async () => {
        const rejecting: Fixture = await withCredentials();
        vi.spyOn(rejecting.client, 'authenticate').mockRejectedValue(new PluggyAuthRejectedError());

        await expect(rejecting.connectionsApplication.connect([ITEM_NUBANK])).rejects.toMatchObject({ code: 'connections.invalid_credentials' });

        expect(rejecting.credentials.rows[0]).toMatchObject({ status: 'invalid' });
    });

    it('com a Pluggy fora do ar na autenticação é erro de rota e não cria nada', async () => {
        const fixture: Fixture = await withCredentials();
        vi.spyOn(fixture.client, 'authenticate').mockRejectedValue(new PluggyUnavailableError('server_error', 503, null));

        await expect(fixture.connectionsApplication.connect([ITEM_NUBANK])).rejects.toMatchObject({ code: 'connections.provider_unavailable' });

        expect(fixture.connections.rows).toHaveLength(0);
    });

    it('devolve o desfecho de cada item, na ordem enviada, com um único authenticate', async () => {
        const fixture: Fixture = await withCredentials();
        const authenticate = vi.spyOn(fixture.client, 'authenticate');

        const { results } = await fixture.connectionsApplication.connect([ITEM_NUBANK, ITEM_ITAU, ITEM_MISSING, ITEM_LOGIN_ERROR]);

        expect(authenticate).toHaveBeenCalledTimes(1);
        expect(results.map((result) => result.outcome)).toEqual(['connected', 'connected', 'not_found', 'connected']);
        expect(results.map((result) => result.itemIdHint)).toEqual(['0000…a001', '0000…a002', '0000…a404', '0000…a409']);
        expect(results[0]?.connection).toMatchObject({ connectorName: 'Nubank', status: 'active', statusReason: null, accounts: [], lastRun: null, syncing: false });
        expect(results[2]?.connection).toBeNull();
        expect(results[3]?.connection).toMatchObject({ status: 'needs_attention', statusReason: 'login_error' });
        expect(JSON.stringify(results)).not.toContain(ITEM_NUBANK);
    });

    it('publica a sincronização inicial só das conexões criadas, com payload de ids', async () => {
        const fixture: Fixture = await withCredentials();

        await fixture.connectionsApplication.connect([ITEM_NUBANK, ITEM_MISSING]);

        expect(fixture.publisher.published).toHaveLength(1);
        const created: string = fixture.connections.rows[0]?.id ?? '';
        expect(fixture.publisher.published[0]?.payload).toEqual({ connectionId: created, companyId: 'company-1', trigger: 'initial' });
        expect(fixture.publisher.published[0]?.options?.jobId).toMatch(new RegExp(`^pluggy-sync-${created}-initial-\\d{10}$`));
    });

    it('um segundo envio do mesmo item é already_connected, sem nova chamada ao item nem publicação', async () => {
        const fixture: Fixture = await withCredentials();
        await fixture.connectionsApplication.connect([ITEM_NUBANK]);
        fixture.publisher.published.length = 0;
        const getItem = vi.spyOn(fixture.client, 'getItem');

        const { results } = await fixture.connectionsApplication.connect([ITEM_NUBANK]);

        expect(results.map((result) => result.outcome)).toEqual(['already_connected']);
        expect(results[0]?.connection?.connectorName).toBe('Nubank');
        expect(getItem).not.toHaveBeenCalled();
        expect(fixture.publisher.published).toEqual([]);
    });

    it('item da Pluggy indisponível vira failed sem derrubar os outros', async () => {
        const fixture: Fixture = await withCredentials();
        const real = fixture.client.getItem.bind(fixture.client);
        vi.spyOn(fixture.client, 'getItem').mockImplementation(async (session, itemId) => {
            if (itemId === ITEM_ITAU) {
                throw new PluggyUnavailableError('timeout', null, null);
            }
            return real(session, itemId);
        });

        const { results } = await fixture.connectionsApplication.connect([ITEM_NUBANK, ITEM_ITAU]);

        expect(results.map((result) => result.outcome)).toEqual(['connected', 'failed']);
    });

    it('erro que não é da Pluggy não vira failed', async () => {
        const fixture: Fixture = await withCredentials();
        vi.spyOn(fixture.client, 'getItem').mockRejectedValue(new Error('boom'));

        await expect(fixture.connectionsApplication.connect([ITEM_NUBANK])).rejects.toThrow('boom');
    });

    it('respeita o limite de 20 conexões', async () => {
        const fixture: Fixture = await withCredentials();
        for (let index = 0; index < 19; index += 1) {
            await fixture.connections.insertIfAbsent({
                externalItemId: `old-${String(index)}`,
                connectorName: null,
                status: 'active',
                statusReason: null,
                providerStatus: null,
                consentExpiresAt: null
            });
        }

        const { results } = await fixture.connectionsApplication.connect([ITEM_NUBANK, ITEM_ITAU]);

        expect(results.map((result) => result.outcome)).toEqual(['connected', 'limit_reached']);
        expect(results[1]?.connection).toBeNull();
        expect(fixture.connections.rows).toHaveLength(20);
    });

    it('trata a corrida em que outra requisição criou o item no meio como already_connected', async () => {
        const fixture: Fixture = await withCredentials();
        const real = fixture.client.getItem.bind(fixture.client);
        vi.spyOn(fixture.client, 'getItem').mockImplementation(async (session, itemId) => {
            await fixture.connections.insertIfAbsent({
                externalItemId: itemId,
                connectorName: 'Nubank',
                status: 'active',
                statusReason: null,
                providerStatus: 'UPDATED',
                consentExpiresAt: null
            });
            return real(session, itemId);
        });

        const { results } = await fixture.connectionsApplication.connect([ITEM_NUBANK]);

        expect(results.map((result) => result.outcome)).toEqual(['already_connected']);
        expect(fixture.publisher.published).toEqual([]);
    });

    it('lista as credenciais e as conexões com contas e a última execução, sem chamar a Pluggy', async () => {
        const fixture: Fixture = await withCredentials();
        await fixture.connectionsApplication.connect([ITEM_NUBANK]);
        const connection = fixture.connections.rows[0];
        fixture.links.link(connection?.id ?? '', 'account-1');
        fixture.runs.rows.push({
            id: 'run-1',
            companyId: 'company-1',
            connectionId: connection?.id ?? '',
            trigger: 'initial',
            status: 'running',
            accounts: 0,
            fetched: 0,
            inserted: 3,
            updated: 0,
            duplicates: 0,
            failureCode: null,
            startedAt: new Date('2026-10-11T10:00:00.000Z'),
            finishedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null
        });
        const authenticate = vi.spyOn(fixture.client, 'authenticate');
        const getItem = vi.spyOn(fixture.client, 'getItem');

        const overview = await fixture.connectionsApplication.overview();

        expect(authenticate).not.toHaveBeenCalled();
        expect(getItem).not.toHaveBeenCalled();
        expect(overview.credentials).toMatchObject({ configured: true, clientIdHint: '3f9a…a5b6' });
        expect(overview.connections).toHaveLength(1);
        expect(overview.connections[0]).toMatchObject({
            connectorName: 'Nubank',
            syncing: true,
            accounts: [{ accountId: 'account-1', name: 'Conta account-1', kind: 'checking', numberLast4: '1234' }],
            lastRun: { trigger: 'initial', status: 'running', startedAt: '2026-10-11T10:00:00.000Z', finishedAt: null, inserted: 3, failureCode: null }
        });
    });

    it('desconecta uma conexão sem apagar o histórico', async () => {
        const fixture: Fixture = await withCredentials();
        await fixture.connectionsApplication.connect([ITEM_NUBANK, ITEM_ITAU]);
        const target: string = fixture.connections.rows[0]?.id ?? '';
        fixture.links.link(target, 'account-1');

        await fixture.connectionsApplication.disconnect(target, false);

        expect(fixture.connections.rows[0]).toMatchObject({ status: 'disconnected' });
        expect(fixture.connections.rows[1]).toMatchObject({ status: 'active' });
        expect(fixture.accountService.removeProviderAccounts).not.toHaveBeenCalled();
        expect((await fixture.connectionsApplication.overview()).connections).toHaveLength(1);
    });

    it('desconecta com purge mandando apagar as contas da conexão', async () => {
        const fixture: Fixture = await withCredentials();
        await fixture.connectionsApplication.connect([ITEM_NUBANK]);
        const target: string = fixture.connections.rows[0]?.id ?? '';
        fixture.links.link(target, 'account-1');

        await fixture.connectionsApplication.disconnect(target, true);

        expect(fixture.accountService.removeProviderAccounts).toHaveBeenCalledWith(['account-1']);
    });

    it('desconectar uma conexão que não existe devolve 404', async () => {
        const fixture: Fixture = await withCredentials();

        await expect(fixture.connectionsApplication.disconnect('inexistente', false)).rejects.toMatchObject({
            code: 'connections.connection_not_found',
            status: 404
        });
    });
});
