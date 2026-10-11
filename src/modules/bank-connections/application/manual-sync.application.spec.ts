import { describe, expect, it, vi } from 'vitest';
import { CLIENT_ID, ITEM_ITAU, ITEM_LOGIN_ERROR, ITEM_NUBANK, SENTINEL } from '../../../../test/support/bank-connections-fakes';
import { buildSyncFixture, connectionOf, SyncFixture } from '../../../../test/support/bank-sync-fakes';

async function seeded(): Promise<SyncFixture> {
    const fixture: SyncFixture = buildSyncFixture();
    await fixture.credentialsApplication.save({ clientId: CLIENT_ID, clientSecret: SENTINEL });
    await fixture.connectionsApplication.connect([ITEM_NUBANK, ITEM_ITAU, ITEM_LOGIN_ERROR]);
    fixture.publisher.published.length = 0;
    return fixture;
}

describe('ManualSyncApplication', () => {
    it('enfileira a sincronização manual da conexão com jobId por janela de 10 minutos', async () => {
        const fixture: SyncFixture = await seeded();
        const id: string = connectionOf(fixture).id;

        expect(await fixture.manualApplication.syncOne(id)).toEqual({ queued: true });

        expect(fixture.publisher.published).toHaveLength(1);
        expect(fixture.publisher.published[0]?.payload).toMatchObject({ connectionId: id, trigger: 'manual' });
        expect(fixture.publisher.published[0]?.options).toMatchObject({ replaceExisting: true, attempts: 3 });
        expect(fixture.publisher.published[0]?.options?.jobId).toMatch(new RegExp(`^pluggy-sync-${id}-manual-\\d{12}$`));
    });

    it('conexão de outra company ou inexistente dá connection_not_found', async () => {
        const fixture: SyncFixture = await seeded();

        await expect(fixture.manualApplication.syncOne(crypto.randomUUID())).rejects.toMatchObject({
            code: 'connections.connection_not_found'
        });
    });

    it('com execução running iniciada há menos de 15 minutos devolve sync_in_progress', async () => {
        const fixture: SyncFixture = await seeded();
        const id: string = connectionOf(fixture).id;
        await fixture.runs.begin(id, 'daily');

        await expect(fixture.manualApplication.syncOne(id)).rejects.toMatchObject({ code: 'connections.sync_in_progress', status: 409 });
        expect(fixture.publisher.published).toHaveLength(0);
    });

    it('execução running com mais de 15 minutos não bloqueia', async () => {
        const fixture: SyncFixture = await seeded();
        const id: string = connectionOf(fixture).id;
        const run = await fixture.runs.begin(id, 'daily');
        fixture.runs.rows = fixture.runs.rows.map((row) =>
            row.id === run.id ? { ...row, startedAt: new Date(Date.now() - 20 * 60_000) } : row
        );

        expect(await fixture.manualApplication.syncOne(id)).toEqual({ queued: true });
    });

    it('conexão revogada exige reautorizar: item_not_found', async () => {
        const fixture: SyncFixture = await seeded();
        const id: string = connectionOf(fixture).id;
        fixture.connections.setStatus(id, 'revoked');

        await expect(fixture.manualApplication.syncOne(id)).rejects.toMatchObject({ code: 'connections.item_not_found', status: 422 });
    });

    it('sem credencial devolve credentials_missing e com credencial inválida devolve invalid_credentials', async () => {
        const fixture: SyncFixture = await seeded();
        const id: string = connectionOf(fixture).id;

        await fixture.vault.markInvalid('invalid_credentials');
        await expect(fixture.manualApplication.syncOne(id)).rejects.toMatchObject({ code: 'connections.invalid_credentials' });
        await expect(fixture.manualApplication.syncAll()).rejects.toMatchObject({ code: 'connections.invalid_credentials' });

        await fixture.vault.remove();
        await expect(fixture.manualApplication.syncOne(id)).rejects.toMatchObject({ code: 'connections.credentials_missing' });
        await expect(fixture.manualApplication.syncAll()).rejects.toMatchObject({ code: 'connections.credentials_missing' });
    });

    it('conexão pausada devolve o erro de credencial correspondente ao motivo', async () => {
        const fixture: SyncFixture = await seeded();
        const [first, second] = [connectionOf(fixture, 0).id, connectionOf(fixture, 1).id];
        await fixture.connections.applyState(first, { status: 'paused', statusReason: 'credentials_invalid' });
        await fixture.connections.applyState(second, { status: 'paused', statusReason: 'credentials_missing' });

        await expect(fixture.manualApplication.syncOne(first)).rejects.toMatchObject({ code: 'connections.invalid_credentials' });
        await expect(fixture.manualApplication.syncOne(second)).rejects.toMatchObject({ code: 'connections.credentials_missing' });
    });

    it('sincronizar tudo enfileira só as sincronizáveis que não estão rodando', async () => {
        const fixture: SyncFixture = await seeded();
        fixture.connections.setStatus(connectionOf(fixture, 1).id, 'revoked');
        await fixture.runs.begin(connectionOf(fixture, 2).id, 'daily');

        const result = await fixture.manualApplication.syncAll();

        expect(result).toEqual({ queued: 1 });
        expect(fixture.publisher.published.map((entry) => (entry.payload as { connectionId: string }).connectionId)).toEqual([
            connectionOf(fixture, 0).id
        ]);
    });

    it('falha ao publicar sobe como 503 e a contagem reflete o que foi publicado', async () => {
        const fixture: SyncFixture = await seeded();
        const publish = vi.spyOn(fixture.publisher, 'publish').mockRejectedValue(new Error('redis fora'));

        await expect(fixture.manualApplication.syncOne(connectionOf(fixture).id)).rejects.toMatchObject({
            code: 'connections.sync_unavailable',
            status: 503
        });
        await expect(fixture.manualApplication.syncAll()).rejects.toMatchObject({ code: 'connections.sync_unavailable' });

        publish.mockRestore();
        const original = fixture.publisher.publish.bind(fixture.publisher);
        vi.spyOn(fixture.publisher, 'publish')
            .mockImplementationOnce(() => Promise.reject(new Error('redis fora')))
            .mockImplementation(original);
        expect(await fixture.manualApplication.syncAll()).toEqual({ queued: 2 });
    });

    it('sincronizar tudo sem conexões devolve zero', async () => {
        const fixture: SyncFixture = buildSyncFixture();
        await fixture.credentialsApplication.save({ clientId: CLIENT_ID, clientSecret: SENTINEL });

        expect(await fixture.manualApplication.syncAll()).toEqual({ queued: 0 });
    });
});
