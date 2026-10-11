import { describe, expect, it } from 'vitest';
import { CLIENT_ID, COMPANY_ID, ITEM_ITAU, ITEM_LOGIN_ERROR, ITEM_NUBANK, SENTINEL } from '../../../../test/support/bank-connections-fakes';
import { buildSyncFixture, connectionOf, SyncFixture } from '../../../../test/support/bank-sync-fakes';

async function seeded(): Promise<SyncFixture> {
    const fixture: SyncFixture = buildSyncFixture();
    await fixture.credentialsApplication.save({ clientId: CLIENT_ID, clientSecret: SENTINEL });
    await fixture.connectionsApplication.connect([ITEM_NUBANK, ITEM_ITAU, ITEM_LOGIN_ERROR]);
    fixture.publisher.published.length = 0;
    return fixture;
}

describe('SyncFanoutApplication', () => {
    it('publica um job por conexão sincronizável, com atraso crescente e só ids no payload', async () => {
        const fixture: SyncFixture = await seeded();
        fixture.connections.setStatus(connectionOf(fixture, 1).id, 'revoked');

        const queued: number = await fixture.fanoutApplication.handleTick();

        expect(queued).toBe(2);
        expect(fixture.publisher.published.map((entry) => entry.payload)).toEqual([
            { connectionId: connectionOf(fixture, 0).id, companyId: COMPANY_ID, trigger: 'daily' },
            { connectionId: connectionOf(fixture, 2).id, companyId: COMPANY_ID, trigger: 'daily' }
        ]);
        expect(fixture.publisher.published.map((entry) => entry.options?.delayMs)).toEqual([0, 2000]);
        expect(fixture.publisher.published.every((entry) => entry.queue === 'vera-bank-connections')).toBe(true);
        expect(fixture.publisher.published[0]?.options).toMatchObject({ attempts: 3, backoffDelayMs: 60_000 });
    });

    it('não publica conexão pausada, revogada nem desconectada', async () => {
        const fixture: SyncFixture = await seeded();
        fixture.connections.setStatus(connectionOf(fixture, 0).id, 'paused');
        fixture.connections.setStatus(connectionOf(fixture, 1).id, 'revoked');
        await fixture.connectionsApplication.disconnect(connectionOf(fixture, 2).id, false);

        expect(await fixture.fanoutApplication.handleTick()).toBe(0);
        expect(fixture.publisher.published).toHaveLength(0);
    });

    it('usa o mesmo jobId no mesmo dia e respeita o espaçamento configurado', async () => {
        const fixture: SyncFixture = buildSyncFixture({}, { PLUGGY_SYNC_SPACING_MS: 500 });
        await fixture.credentialsApplication.save({ clientId: CLIENT_ID, clientSecret: SENTINEL });
        await fixture.connectionsApplication.connect([ITEM_NUBANK, ITEM_ITAU]);
        fixture.publisher.published.length = 0;

        await fixture.fanoutApplication.handleTick();
        await fixture.fanoutApplication.handleTick();

        const ids = fixture.publisher.published.map((entry) => entry.options?.jobId);
        expect(ids[0]).toBe(ids[2]);
        expect(ids[1]).toBe(ids[3]);
        expect(ids[0]).not.toBe(ids[1]);
        expect(ids[0]).toMatch(/^pluggy-sync-[0-9a-f-]+-daily-\d{8}$/);
        expect(ids.every((id) => !(id ?? '').includes(':'))).toBe(true);
        expect(fixture.publisher.published[1]?.options?.delayMs).toBe(500);
    });

    it('atualiza o gauge vera_bank_connections por status, zerando os que não existem', async () => {
        const fixture: SyncFixture = await seeded();
        fixture.connections.setStatus(connectionOf(fixture, 0).id, 'paused');

        await fixture.fanoutApplication.handleTick();

        const gauges = new Map(
            fixture.metricEntries
                .map((entry) => entry as [string, number, { status: string }])
                .filter((entry) => entry[0] === 'vera_bank_connections')
                .map((entry) => [entry[2].status, entry[1]])
        );
        expect(gauges.get('active')).toBe(1);
        expect(gauges.get('needs_attention')).toBe(1);
        expect(gauges.get('paused')).toBe(1);
        expect(gauges.get('revoked')).toBe(0);
    });

    it('registra quantas conexões foram enfileiradas sem listar ids', async () => {
        const fixture: SyncFixture = await seeded();

        await fixture.fanoutApplication.handleTick();

        expect(fixture.logEntries).toContainEqual(
            expect.objectContaining({ identifier: 'bank-connections-sync-fanout', meta: { connections: 3 } })
        );
    });
});
