import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SecretSealerPort } from '../../src/core/crypto/secret-sealer.port';
import { AccountDataRegistry } from '../../src/modules/identity/services/account-data.registry';
import { Account, AllocationHarness } from './support/allocation-harness';

const CLIENT_ID: string = '3f9a1b2c-4d5e-4f60-8a9b-c2e1d3f4a5b6';
const SENTINEL: string = 'vera-sentinel-7c1d2e3f-4a5b-4c6d-8e7f-a1b2c3d4e5f6';
const PATH: string = '/spending/connections/credentials';

interface CredentialsBody {
    readonly configured: boolean;
    readonly clientIdHint: string | null;
    readonly status: string | null;
}

interface ProblemBody {
    readonly type: string;
    readonly meta?: { errors?: { path: string; code: string }[] };
}

describe('bank connections credentials', () => {
    let harness: AllocationHarness;
    let alice: Account;
    let bob: Account;

    beforeAll(async () => {
        harness = await AllocationHarness.start('bank_credentials');
        alice = await harness.signUp('alice');
        bob = await harness.signUp('bob');
    });

    afterAll(async () => {
        await harness.stop();
    });

    it('exige sessão em todas as rotas', async () => {
        const statuses: number[] = await Promise.all([
            harness.call(null, 'GET', PATH).then((response) => response.status),
            harness.call(null, 'PUT', PATH, {}).then((response) => response.status),
            harness.call(null, 'POST', `${PATH}/test`).then((response) => response.status),
            harness.call(null, 'DELETE', PATH).then((response) => response.status)
        ]);

        expect(statuses).toEqual([401, 401, 401, 401]);
    });

    it('cumpre o ciclo: grava, mostra só a dica, recusa a inválida mantendo a antiga e remove', async () => {
        const empty = await harness.call<CredentialsBody>(alice.token, 'GET', PATH);
        expect(empty.body.configured).toBe(false);

        const saved = await harness.call<CredentialsBody>(alice.token, 'PUT', PATH, { clientId: CLIENT_ID, clientSecret: SENTINEL });
        expect(saved.status).toBe(200);
        expect(saved.body).toMatchObject({ configured: true, clientIdHint: '3f9a…a5b6', status: 'valid' });

        const shown = await harness.call<CredentialsBody>(alice.token, 'GET', PATH);
        expect(JSON.stringify(shown.body)).not.toContain(SENTINEL);
        expect(JSON.stringify(shown.body)).not.toContain(CLIENT_ID);

        const rejected = await harness.call<ProblemBody>(alice.token, 'PUT', PATH, {
            clientId: CLIENT_ID,
            clientSecret: 'mock-invalid-secret'
        });
        expect(rejected.status).toBe(422);
        expect(rejected.body.type).toBe('connections.invalid_credentials');
        expect((await harness.call<CredentialsBody>(alice.token, 'GET', PATH)).body.configured).toBe(true);

        const unavailable = await harness.call<ProblemBody>(alice.token, 'PUT', PATH, {
            clientId: CLIENT_ID,
            clientSecret: 'mock-unavailable-secret'
        });
        expect(unavailable.status).toBe(502);
        expect(unavailable.body.type).toBe('connections.provider_unavailable');

        const tested = await harness.call<CredentialsBody>(alice.token, 'POST', `${PATH}/test`);
        expect(tested).toMatchObject({ status: 200, body: { status: 'valid' } });

        expect((await harness.call(alice.token, 'DELETE', PATH)).status).toBe(204);
        expect((await harness.call<CredentialsBody>(alice.token, 'GET', PATH)).body.configured).toBe(false);
        expect((await harness.call<ProblemBody>(alice.token, 'POST', `${PATH}/test`)).body.type).toBe('connections.credentials_missing');
    });

    it('guarda o selado sem o texto do segredo e a rotação deixa uma única linha', async () => {
        await harness.call(bob.token, 'PUT', PATH, { clientId: CLIENT_ID, clientSecret: SENTINEL });
        await harness.call(bob.token, 'PUT', PATH, { clientId: CLIENT_ID, clientSecret: `${SENTINEL}-novo` });

        const rows = await harness.pg.query<{ sealed: string; sealerDriver: string }>(
            'SELECT "sealed", "sealerDriver" FROM "PluggyCredentials" WHERE "companyId" = $1',
            [bob.company.id]
        );
        expect(rows.rows).toHaveLength(1);
        expect(rows.rows[0]?.sealerDriver).toBe('local');
        expect(rows.rows[0]?.sealed).not.toContain('sentinel');
        const textual = await harness.pg.query('SELECT 1 FROM "PluggyCredentials" WHERE "sealed" LIKE $1', [`%${SENTINEL}%`]);
        expect(textual.rowCount).toBe(0);
    });

    it('não ecoa o segredo na validação de campo', async () => {
        const response = await harness.call<ProblemBody>(alice.token, 'PUT', PATH, { clientId: SENTINEL, clientSecret: 'curto' });

        expect(response.status).toBe(400);
        expect(response.body.type).toBe('validation_failed');
        expect(response.body.meta?.errors).toEqual([
            { path: 'clientId', code: 'invalid_string' },
            { path: 'clientSecret', code: 'too_small' }
        ]);
        expect(JSON.stringify(response.body)).not.toContain('sentinel');
    });

    it('isola as companies: B não vê a credencial de A e o selado de A não abre no contexto de B', async () => {
        await harness.call(alice.token, 'PUT', PATH, { clientId: CLIENT_ID, clientSecret: SENTINEL });
        const carol: Account = await harness.signUp('carol');

        expect((await harness.call<CredentialsBody>(carol.token, 'GET', PATH)).body.configured).toBe(false);
        expect((await harness.call<ProblemBody>(carol.token, 'POST', `${PATH}/test`)).body.type).toBe('connections.credentials_missing');

        const row = await harness.pg.query<{ sealed: string }>('SELECT "sealed" FROM "PluggyCredentials" WHERE "companyId" = $1', [
            alice.company.id
        ]);
        const sealer: SecretSealerPort = harness.app.get(SecretSealerPort, { strict: false });
        await expect(
            sealer.open(row.rows[0]?.sealed ?? '', { companyId: carol.company.id, purpose: 'pluggy-credentials' })
        ).rejects.toMatchObject({
            code: 'core.secret_open_failed'
        });
        await expect(
            sealer.open(row.rows[0]?.sealed ?? '', { companyId: alice.company.id, purpose: 'pluggy-credentials' })
        ).resolves.toContain(CLIENT_ID);
    });

    it('limita a 5 gravações em 10 minutos por company', async () => {
        const dave: Account = await harness.signUp('dave');
        const statuses: number[] = [];

        for (let attempt = 0; attempt < 6; attempt += 1) {
            statuses.push((await harness.call(dave.token, 'PUT', PATH, { clientId: CLIENT_ID, clientSecret: SENTINEL })).status);
        }

        expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    });

    it('entra no export da conta sem segredo e o eraser apaga as credenciais', async () => {
        const erin: Account = await harness.signUp('erin');
        await harness.call(erin.token, 'PUT', PATH, { clientId: CLIENT_ID, clientSecret: SENTINEL });
        const registry: AccountDataRegistry = harness.app.get(AccountDataRegistry, { strict: false });

        const sections = await harness.inCompany(erin.company.id, async () => registry.exportSections(erin.company.id));
        expect(sections['bank_connections']).toEqual({
            credentials: { configured: true, clientIdHint: '3f9a…a5b6', status: 'valid' },
            connections: []
        });
        expect(JSON.stringify(sections['bank_connections'])).not.toContain(SENTINEL);

        const erased = await harness.inCompany(erin.company.id, async () => registry.eraseAll(erin.company.id));
        expect(erased).toContainEqual({ area: 'pluggy_credentials', erased: 1 });
        expect((await harness.call<CredentialsBody>(erin.token, 'GET', PATH)).body.configured).toBe(false);
    });
});
