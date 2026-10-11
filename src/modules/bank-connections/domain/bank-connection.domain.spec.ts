import { describe, expect, it } from 'vitest';
import { buildFixture, Fixture } from '../../../../test/support/bank-connections-fakes';
import { ConnectionDraft } from './bank-connections.types';

function draft(externalItemId: string): ConnectionDraft {
    return { externalItemId, connectorName: null, status: 'active', statusReason: null, providerStatus: null, consentExpiresAt: null };
}

describe('BankConnectionDomain', () => {
    it('registra em ordem, conta o limite e marca o repetido', async () => {
        const fixture: Fixture = buildFixture();

        const first = await fixture.connectionDomain.registerAll([draft('a'), draft('b'), draft('a')]);

        expect(first.map((entry) => entry.outcome)).toEqual(['connected', 'connected', 'already_connected']);
        expect(first[2]?.connection?.externalItemId).toBe('a');
    });

    it('para de criar ao chegar em 20 conexões', async () => {
        const fixture: Fixture = buildFixture();
        const drafts: ConnectionDraft[] = Array.from({ length: 22 }, (_unused, index) => draft(`item-${String(index)}`));

        const registered = await fixture.connectionDomain.registerAll(drafts);

        expect(registered.filter((entry) => entry.outcome === 'connected')).toHaveLength(20);
        expect(registered.slice(20).map((entry) => entry.outcome)).toEqual(['limit_reached', 'limit_reached']);
    });

    it('desconectar devolve as contas vinculadas sem repetir e some das listas', async () => {
        const fixture: Fixture = buildFixture();
        const [one, two] = await fixture.connectionDomain.registerAll([draft('a'), draft('b')]);
        fixture.links.link(one?.connection?.id ?? '', 'account-1');
        fixture.links.link(one?.connection?.id ?? '', 'account-1');
        fixture.links.link(two?.connection?.id ?? '', 'account-2');

        const disconnection = await fixture.connectionDomain.disconnect(one?.connection?.id ?? '');

        expect(disconnection.accountIds).toEqual(['account-1']);
        expect(await fixture.connectionDomain.countAll()).toBe(1);
        expect((await fixture.connectionDomain.listDetails()).map((entry) => entry.links.length)).toEqual([1]);
    });

    it('disconnectAll cobre todas as conexões e junta as contas', async () => {
        const fixture: Fixture = buildFixture();
        const [one, two] = await fixture.connectionDomain.registerAll([draft('a'), draft('b')]);
        fixture.links.link(one?.connection?.id ?? '', 'account-1');
        fixture.links.link(two?.connection?.id ?? '', 'account-2');

        const disconnection = await fixture.connectionDomain.disconnectAll();

        expect(disconnection.connections).toHaveLength(2);
        expect(disconnection.accountIds).toEqual(['account-1', 'account-2']);
    });

    it('desconectar o que não existe lança connection_not_found', async () => {
        const fixture: Fixture = buildFixture();

        await expect(fixture.connectionDomain.disconnect('nope')).rejects.toMatchObject({ code: 'connections.connection_not_found' });
    });

    it('findExisting acha pelos item ids', async () => {
        const fixture: Fixture = buildFixture();
        await fixture.connectionDomain.registerAll([draft('a'), draft('b')]);

        expect((await fixture.connectionDomain.findExisting(['b', 'z'])).map((connection) => connection.externalItemId)).toEqual(['b']);
    });
});
