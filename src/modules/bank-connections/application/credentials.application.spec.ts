import { describe, expect, it, vi } from 'vitest';
import {
    buildFixture,
    CLIENT_ID,
    Fixture,
    ITEM_ITAU,
    ITEM_NUBANK,
    SENTINEL
} from '../../../../test/support/bank-connections-fakes';
import { PluggyCredentialsPlain } from '../drivers/pluggy-session';
import { PluggyUnavailableError } from '../ports/pluggy-client.errors';

const GOOD: { clientId: string; clientSecret: string } = { clientId: CLIENT_ID, clientSecret: SENTINEL };

async function connected(fixture: Fixture): Promise<void> {
    await fixture.credentialsApplication.save(GOOD);
    await fixture.connectionsApplication.connect([ITEM_NUBANK, ITEM_ITAU]);
}

describe('CredentialsApplication', () => {
    it('mostra que não há credencial antes de salvar', async () => {
        const fixture: Fixture = buildFixture();

        expect(await fixture.credentialsApplication.get()).toEqual({
            configured: false,
            clientIdHint: null,
            status: null,
            lastVerifiedAt: null,
            updatedAt: null
        });
    });

    it('testa antes de gravar, sela o par e devolve só a dica', async () => {
        const fixture: Fixture = buildFixture();

        const view = await fixture.credentialsApplication.save(GOOD);

        expect(view).toMatchObject({ configured: true, clientIdHint: '3f9a…a5b6', status: 'valid' });
        expect(Object.keys(view).sort()).toEqual(['clientIdHint', 'configured', 'lastVerifiedAt', 'status', 'updatedAt']);
        expect(fixture.credentials.rows).toHaveLength(1);
        expect(fixture.credentials.rows[0]?.sealed).not.toContain(SENTINEL);
        expect(fixture.credentials.rows[0]).toMatchObject({ sealerDriver: 'local', clientIdHint: '3f9a…a5b6' });
    });

    it('com 401 da Pluggy não grava nada e devolve invalid_credentials', async () => {
        const fixture: Fixture = buildFixture({ config: { MOCK_PLUGGY_FORCE_401: true } });

        await expect(fixture.credentialsApplication.save(GOOD)).rejects.toMatchObject({ code: 'connections.invalid_credentials', status: 422 });

        expect(fixture.credentials.rows).toHaveLength(0);
    });

    it('mantém a credencial antiga quando a nova é recusada', async () => {
        const fixture: Fixture = buildFixture();
        await fixture.credentialsApplication.save(GOOD);
        const before: string | undefined = fixture.credentials.rows[0]?.sealed;

        await expect(fixture.credentialsApplication.save({ clientId: CLIENT_ID, clientSecret: 'mock-invalid-secret' })).rejects.toMatchObject({
            code: 'connections.invalid_credentials'
        });

        expect(fixture.credentials.rows[0]?.sealed).toBe(before);
    });

    it('com a Pluggy fora do ar não grava e devolve provider_unavailable com o Retry-After', async () => {
        const unavailable: PluggyUnavailableError = new PluggyUnavailableError('rate_limited', 429, 60);
        const fixture: Fixture = buildFixture({
            client: {
                authenticate: vi.fn().mockRejectedValue(unavailable),
                getItem: vi.fn(),
                listAccounts: vi.fn(),
                listTransactions: vi.fn()
            }
        });

        await expect(fixture.credentialsApplication.save(GOOD)).rejects.toMatchObject({
            code: 'connections.provider_unavailable',
            status: 502,
            meta: { retryAfterSeconds: 60 }
        });

        expect(fixture.credentials.rows).toHaveLength(0);
    });

    it('propaga erro inesperado do cliente sem gravar', async () => {
        const fixture: Fixture = buildFixture({
            client: { authenticate: vi.fn().mockRejectedValue(new Error('boom')), getItem: vi.fn(), listAccounts: vi.fn(), listTransactions: vi.fn() }
        });

        await expect(fixture.credentialsApplication.save(GOOD)).rejects.toThrow('boom');

        expect(fixture.credentials.rows).toHaveLength(0);
    });

    it('na troca apaga a anterior de verdade e reativa as conexões pausadas com uma sincronização cada', async () => {
        const fixture: Fixture = buildFixture();
        await connected(fixture);
        const paused: string = fixture.connections.rows[1]?.id ?? '';
        fixture.connections.setStatus(paused, 'paused');
        fixture.publisher.published.length = 0;

        await fixture.credentialsApplication.save({ clientId: CLIENT_ID, clientSecret: `${SENTINEL}-novo` });

        expect(fixture.credentials.rows).toHaveLength(1);
        expect(fixture.connections.rows.map((row) => row.status)).toEqual(['active', 'active']);
        expect(fixture.publisher.published).toHaveLength(1);
        expect(fixture.publisher.published[0]).toMatchObject({
            queue: 'vera-bank-connections',
            type: 'bank-connections.sync.requested',
            payload: { connectionId: paused, companyId: 'company-1', trigger: 'credentials_rotated' }
        });
        expect(fixture.publisher.published[0]?.options?.jobId).toMatch(new RegExp(`^pluggy-sync-${paused}-credentials_rotated-\\d{10}$`));
        expect(fixture.logCalls).toContainEqual(expect.objectContaining({ meta: { action: 'rotated', status: 'valid' } }));
    });

    it('a primeira gravação não publica sincronização', async () => {
        const fixture: Fixture = buildFixture();

        await fixture.credentialsApplication.save(GOOD);

        expect(fixture.publisher.published).toEqual([]);
        expect(fixture.logCalls).toContainEqual(expect.objectContaining({ meta: { action: 'saved', status: 'valid' } }));
    });

    it('testar sem credencial devolve credentials_missing', async () => {
        const fixture: Fixture = buildFixture();

        await expect(fixture.credentialsApplication.test()).rejects.toMatchObject({ code: 'connections.credentials_missing', status: 422 });
    });

    it('testar com sucesso atualiza a data e mantém válido', async () => {
        const fixture: Fixture = buildFixture();
        await fixture.credentialsApplication.save(GOOD);

        const view = await fixture.credentialsApplication.test();

        expect(view).toMatchObject({ configured: true, status: 'valid' });
        expect(fixture.logCalls).toContainEqual(expect.objectContaining({ meta: { action: 'tested', status: 'valid' } }));
    });

    it('testar com 401 marca invalid e responde 200 com status invalid', async () => {
        const failing: Fixture = buildFixture({ config: { MOCK_PLUGGY_FORCE_401: true } });
        await failing.credentialsDomain.replace(await failing.vault.seal(new PluggyCredentialsPlain(CLIENT_ID, SENTINEL)));

        const view = await failing.credentialsApplication.test();

        expect(view).toMatchObject({ configured: true, status: 'invalid' });
        expect(failing.credentials.rows[0]).toMatchObject({ status: 'invalid', lastErrorCode: 'invalid_credentials' });
    });

    it('testar de novo uma credencial inválida volta a válida quando a Pluggy aceita', async () => {
        const fixture: Fixture = buildFixture();
        await fixture.credentialsApplication.save(GOOD);
        await fixture.vault.markInvalid('invalid_credentials');

        const view = await fixture.credentialsApplication.test();

        expect(view.status).toBe('valid');
        expect(fixture.credentials.rows[0]?.lastErrorCode).toBeNull();
    });

    it('testar com a Pluggy fora do ar devolve 502 e não muda o status', async () => {
        const down: Fixture = buildFixture({
            client: { authenticate: vi.fn().mockRejectedValue(new PluggyUnavailableError('timeout', null, null)), getItem: vi.fn(), listAccounts: vi.fn(), listTransactions: vi.fn() }
        });
        await down.credentialsDomain.replace(await down.vault.seal(new PluggyCredentialsPlain(CLIENT_ID, SENTINEL)));

        await expect(down.credentialsApplication.test()).rejects.toMatchObject({ code: 'connections.provider_unavailable' });

        expect(down.credentials.rows[0]?.status).toBe('valid');
    });

    it('remover sem purge apaga o selado, desconecta tudo e mantém contas e transações', async () => {
        const fixture: Fixture = buildFixture();
        await connected(fixture);
        const connectionId: string = fixture.connections.rows[0]?.id ?? '';
        fixture.links.link(connectionId, 'account-1');

        await fixture.credentialsApplication.remove(false);

        expect(fixture.credentials.rows).toEqual([]);
        expect(fixture.connections.rows.every((row) => row.status === 'disconnected' && row.deletedAt !== null)).toBe(true);
        expect(fixture.accountService.removeProviderAccounts).not.toHaveBeenCalled();
        expect(await fixture.credentialsApplication.get()).toMatchObject({ configured: false });
    });

    it('remover com purge manda apagar as contas vinculadas', async () => {
        const fixture: Fixture = buildFixture();
        await connected(fixture);
        fixture.links.link(fixture.connections.rows[0]?.id ?? '', 'account-1');
        fixture.links.link(fixture.connections.rows[1]?.id ?? '', 'account-2');

        await fixture.credentialsApplication.remove(true);

        expect(fixture.accountService.removeProviderAccounts).toHaveBeenCalledWith(['account-1', 'account-2']);
    });

    it('remover sem credencial é idempotente', async () => {
        const fixture: Fixture = buildFixture();

        await expect(fixture.credentialsApplication.remove(false)).resolves.toBeUndefined();
    });
});
