import { describe, expect, it, vi } from 'vitest';
import { CLIENT_ID, COMPANY_ID, ITEM_NUBANK, SENTINEL } from '../../../test/support/bank-connections-fakes';
import { buildSyncFixture, connectionOf, SyncFixture } from '../../../test/support/bank-sync-fakes';
import { PluggySession } from './drivers/pluggy-session';
import { PluggyUnavailableError } from './ports/pluggy-client.errors';

const API_KEY: string = 'jwt-sentinel-9d2f7c1a-5b3e-4a86-8c0d-aabbccddeeff';

function everythingVisible(fixture: SyncFixture): string {
    return JSON.stringify({
        logs: fixture.logEntries,
        metrics: fixture.metricEntries,
        runs: fixture.runs.rows,
        connections: fixture.connections.rows,
        links: fixture.links.rows,
        accounts: [...fixture.financialAccounts.rows.values()],
        published: fixture.publisher.published,
        credentials: fixture.credentials.rows.map((row) => ({ ...row, sealed: '[sealed]' }))
    });
}

async function run(fixture: SyncFixture, trigger: string = 'daily'): Promise<unknown> {
    return fixture.syncApplication.handle({ connectionId: connectionOf(fixture).id, companyId: COMPANY_ID, trigger });
}

describe('sigilo da sincronização', () => {
    it('o apiKey e o segredo não aparecem em log, métrica, execução, vínculo nem payload, no sucesso e nas falhas', async () => {
        const fixture: SyncFixture = buildSyncFixture();
        await fixture.credentialsApplication.save({ clientId: CLIENT_ID, clientSecret: SENTINEL });
        await fixture.connectionsApplication.connect([ITEM_NUBANK]);
        vi.spyOn(fixture.client, 'authenticate').mockResolvedValue(new PluggySession(API_KEY));
        await fixture.manualApplication.syncOne(connectionOf(fixture).id);
        await fixture.fanoutApplication.handleTick();

        await run(fixture);
        fixture.ingestion.failForAccount = new Set(['account-nubank-card']);
        await run(fixture);
        vi.spyOn(fixture.client, 'listAccounts').mockRejectedValueOnce(new PluggyUnavailableError('rate_limited', 429, 60));
        await run(fixture);
        vi.spyOn(fixture.client, 'getItem').mockRejectedValueOnce(new Error(`falha com ${API_KEY} e ${SENTINEL}`));
        await run(fixture);
        vi.spyOn(fixture.client, 'getItem').mockResolvedValueOnce(null);
        await run(fixture);

        const visible: string = everythingVisible(fixture);
        expect(visible).not.toContain(API_KEY);
        expect(visible).not.toContain(SENTINEL);
        expect(visible).not.toContain('sentinel');
        expect(fixture.runs.rows.length).toBeGreaterThanOrEqual(5);
    });

    it('o log da execução não leva descrição, valor, nome, documento nem o Item ID', async () => {
        const fixture: SyncFixture = buildSyncFixture();
        await fixture.credentialsApplication.save({ clientId: CLIENT_ID, clientSecret: SENTINEL });
        await fixture.connectionsApplication.connect([ITEM_NUBANK]);

        await run(fixture);

        const logged: string = JSON.stringify(fixture.logEntries);
        for (const item of fixture.ingestion.items()) {
            expect(logged).not.toContain(item.description);
            expect(logged).not.toContain(String(item.amountMinor));
        }
        expect(logged).not.toContain(ITEM_NUBANK);
        expect(logged).not.toContain('Maria Souza');
        expect(logged).not.toContain('00000000191');
    });
});
