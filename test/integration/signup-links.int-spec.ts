import { AddressInfo, Server } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { authenticator } from 'otplib';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, inject } from 'vitest';
import { AppModule } from '../../src/app.module';
import { AppContext } from '../../src/core/context/app-context.port';
import { InvalidGoogleTokenError } from '../../src/modules/identity/domain/identity.errors';
import { LoginProvider, SocialIdentity } from '../../src/modules/identity/domain/identity.types';
import { SocialIdentityVerifierPort } from '../../src/modules/identity/ports/social-identity-verifier.port';
import { GoogleIdentityVerifier } from '../../src/modules/identity/services/google-identity.verifier';
import { PlatformSeedService } from '../../src/modules/identity/services/platform-seed.service';
import { createIsolatedDatabase, IsolatedDatabase } from './support/isolated-database';
import { isolateRedisForWorker } from './support/queue';

class FakeGoogle extends SocialIdentityVerifierPort {
    public readonly provider: LoginProvider = 'google';
    public enabled: boolean = true;
    private readonly known: Map<string, SocialIdentity> = new Map<string, SocialIdentity>();

    public register(identity: Partial<SocialIdentity> & { subject: string }): string {
        const credential: string = `fake-google-credential-${crypto.randomUUID()}`;
        this.known.set(credential, { provider: 'google', email: null, emailVerified: true, name: null, ...identity });
        return credential;
    }

    public verify(credential: string): Promise<SocialIdentity> {
        const identity: SocialIdentity | undefined = this.known.get(credential);
        return identity ? Promise.resolve(identity) : Promise.reject(new InvalidGoogleTokenError());
    }
}

interface LoginBody {
    readonly accessToken: string;
    readonly user: { id: string };
}

interface LinkBody {
    readonly id: string;
    readonly token: string;
    readonly url: string;
    readonly status: string;
    readonly trial: { kind: string; days: number | null };
    readonly rules: readonly { percent: number; fromCycle: number; toCycle: number }[];
    readonly redemptionCount: number;
}

interface ProblemBody {
    readonly type: string;
    readonly meta?: { reason?: string };
}

interface AuditBody {
    readonly items: readonly { action: string; operatorUserId: string | null; meta: Record<string, unknown> }[];
}

const GOOGLE: FakeGoogle = new FakeGoogle();
const DAY_MS: number = 24 * 60 * 60 * 1000;

function inDays(days: number): string {
    return new Date(Date.now() + days * DAY_MS).toISOString();
}

describe('links de cadastro (hospedada)', () => {
    let app: INestApplication;
    let origin: string;
    let isolated: IsolatedDatabase;
    let pg: Client;
    let adminToken: string;
    let adminId: string;
    const adminEmail: string = `admin-${crypto.randomUUID()}@example.test`;

    function request(method: string, path: string, body?: unknown, token?: string): Promise<Response> {
        return fetch(`${origin}${path}`, {
            method,
            headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
    }

    function createLink(body: unknown, token: string | undefined = adminToken): Promise<Response> {
        return request('POST', '/platform/signup-links', body, token);
    }

    async function auditActions(): Promise<string[]> {
        const audit = (await (await request('GET', '/platform/audit?limit=200', undefined, adminToken)).json()) as AuditBody;
        return audit.items.map((item) => item.action);
    }

    beforeAll(async () => {
        isolated = await createIsolatedDatabase('signup_links');
        process.env['DATABASE_URL'] = isolated.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';
        process.env['DEPLOYMENT_MODE'] = 'hosted';
        process.env['APP_URL'] = 'https://app.example.test/';
        const testing: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(GoogleIdentityVerifier)
            .useValue(GOOGLE)
            .compile();
        app = testing.createNestApplication();
        app.use(cookieParser());
        await app.init();
        await app.listen(0);
        origin = `http://127.0.0.1:${String(((app.getHttpServer() as Server).address() as AddressInfo).port)}`;
        pg = new Client({ connectionString: isolated.url });
        await pg.connect();
        await app.get(AppContext).run({ requestId: 'seed', locale: 'pt-BR' }, async () => app.get(PlatformSeedService).seed(adminEmail));
        const step = (await (
            await request('POST', '/auth/google', {
                idToken: GOOGLE.register({ subject: 'g-admin', email: adminEmail, name: 'Admin' }),
                audience: 'admin'
            })
        ).json()) as { setupToken: string };
        const enrolled = (await (await request('POST', '/auth/totp/enroll', { setupToken: step.setupToken })).json()) as { secret: string };
        const login = (await (
            await request('POST', '/auth/totp/activate', { setupToken: step.setupToken, code: authenticator.generate(enrolled.secret) })
        ).json()) as LoginBody;
        adminToken = login.accessToken;
        adminId = login.user.id;
    });

    afterAll(async () => {
        await pg.end();
        await app.close();
        await isolated.drop();
    });

    beforeEach(async () => {
        await pg.query('DELETE FROM "Throttles"');
    });

    it('cria o link com teste e régua, devolve token e URL, lista e deixa a trilha signup_link.created', async () => {
        const response: Response = await createLink({
            label: 'Parceria X',
            trial: { kind: 'card', days: 14 },
            rules: [
                { percent: 50, fromCycle: 1, toCycle: 3 },
                { percent: 25, fromCycle: 4, toCycle: 6 }
            ],
            maxUses: 100,
            expiresAt: inDays(30)
        });
        const created = (await response.json()) as LinkBody;

        expect(response.status).toBe(201);
        expect(created).toMatchObject({ status: 'active', trial: { kind: 'card', days: 14 }, redemptionCount: 0 });
        expect(created.url).toBe(`https://app.example.test/entrar?oferta=${created.token}`);
        expect(created.rules).toHaveLength(2);
        const listed = (await (await request('GET', '/platform/signup-links', undefined, adminToken)).json()) as { items: LinkBody[] };
        expect(listed.items.map((item) => item.id)).toContain(created.id);
        const audit = (await (await request('GET', '/platform/audit', undefined, adminToken)).json()) as AuditBody;
        expect(audit.items.find((item) => item.action === 'signup_link.created')).toMatchObject({
            operatorUserId: adminId,
            meta: { linkId: created.id, trialKind: 'card' }
        });
    });

    it('teste sem cartão sem limite ou sem validade é recusado com 422 e nada é gravado nem auditado', async () => {
        const before: number = Number((await pg.query<{ total: string }>('SELECT count(*) AS total FROM "SignupLinks"')).rows[0]?.total);

        const response: Response = await createLink({ label: 'Sem limite', trial: { kind: 'no_card', days: 7 }, expiresAt: inDays(10) });

        expect(response.status).toBe(422);
        const problem = (await response.json()) as ProblemBody;
        expect(problem).toMatchObject({ type: 'signup_links.invalid_offer', meta: { reason: 'no_card_requires_max_uses' } });
        const after: number = Number((await pg.query<{ total: string }>('SELECT count(*) AS total FROM "SignupLinks"')).rows[0]?.total);
        expect(after).toBe(before);
    });

    it('recusa régua fora de 1% a 90% e teste fora de 1 a 60 dias com 400', async () => {
        const badRule: Response = await createLink({
            label: 'R',
            trial: { kind: 'none', days: null },
            rules: [{ percent: 95, fromCycle: 1, toCycle: 2 }]
        });
        const badDays: Response = await createLink({ label: 'D', trial: { kind: 'card', days: 61 } });

        expect(badRule.status).toBe(400);
        expect(badDays.status).toBe(400);
    });

    it('o banco também barra teste sem cartão sem limite', async () => {
        await expect(
            pg.query(`INSERT INTO "SignupLinks" (id, token, label, "trialKind", "trialDays") VALUES ($1, $2, 'x', 'no_card', 7)`, [
                crypto.randomUUID(),
                crypto.randomUUID()
            ])
        ).rejects.toMatchObject({ code: '23514' });
    });

    it('a oferta pública mostra teste e régua sem rótulo; revogar devolve 404 igual ao link inexistente e o resgate anterior segue no banco', async () => {
        const created = (await (
            await createLink({
                label: 'Segredo interno',
                trial: { kind: 'none', days: null },
                rules: [{ percent: 10, fromCycle: 1, toCycle: 2 }]
            })
        ).json()) as LinkBody;

        const open: Response = await request('GET', `/signup-links/${created.token}`);
        const offer = (await open.json()) as Record<string, unknown>;

        expect(open.status).toBe(200);
        expect(offer).toEqual({ trial: { kind: 'none', days: null }, rules: [{ percent: 10, fromCycle: 1, toCycle: 2 }], expiresAt: null });

        expect((await request('DELETE', `/platform/signup-links/${created.id}`, undefined, adminToken)).status).toBe(204);
        expect((await request('DELETE', `/platform/signup-links/${created.id}`, undefined, adminToken)).status).toBe(204);
        const revoked: Response = await request('GET', `/signup-links/${created.token}`);
        const unknown: Response = await request('GET', `/signup-links/${'x'.repeat(32)}`);
        expect(revoked.status).toBe(404);
        expect(unknown.status).toBe(404);
        expect(((await revoked.json()) as ProblemBody).type).toBe('signup_links.not_found');
        const actions: string[] = await auditActions();
        expect(actions.filter((action) => action === 'signup_link.revoked')).toHaveLength(1);
        const listed = (await (await request('GET', '/platform/signup-links', undefined, adminToken)).json()) as { items: LinkBody[] };
        expect(listed.items.find((item) => item.id === created.id)?.status).toBe('revoked');
    });

    it('link vencido ou com o limite batido responde 404 na oferta pública', async () => {
        const created = (await (
            await createLink({ label: 'Limitado', trial: { kind: 'none', days: null }, maxUses: 1 })
        ).json()) as LinkBody;
        await pg.query(`UPDATE "SignupLinks" SET "redemptionCount" = 1 WHERE id = $1`, [created.id]);
        const expired = (await (
            await createLink({ label: 'Vencido', trial: { kind: 'none', days: null }, expiresAt: inDays(1) })
        ).json()) as LinkBody;
        await pg.query(`UPDATE "SignupLinks" SET "expiresAt" = now() - interval '1 minute' WHERE id = $1`, [expired.id]);

        expect((await request('GET', `/signup-links/${created.token}`)).status).toBe(404);
        expect((await request('GET', `/signup-links/${expired.token}`)).status).toBe(404);
    });

    it('revogar um id que não existe é 404', async () => {
        const response: Response = await request('DELETE', `/platform/signup-links/${crypto.randomUUID()}`, undefined, adminToken);

        expect(response.status).toBe(404);
        expect(((await response.json()) as ProblemBody).type).toBe('signup_links.not_found');
    });

    it('a pessoa de uma conta comum e quem não tem sessão não criam, listam nem revogam', async () => {
        const common = (await (
            await request('POST', '/auth/google', {
                idToken: GOOGLE.register({ subject: 'g-common', email: `common-${crypto.randomUUID()}@example.test`, name: 'Comum' })
            })
        ).json()) as LoginBody;

        expect((await createLink({ label: 'x', trial: { kind: 'none', days: null } }, common.accessToken)).status).toBe(403);
        expect((await request('GET', '/platform/signup-links', undefined, common.accessToken)).status).toBe(403);
        expect((await request('DELETE', `/platform/signup-links/${crypto.randomUUID()}`, undefined, common.accessToken)).status).toBe(403);
        expect((await request('GET', '/platform/signup-links')).status).toBe(401);
    });

    it('limita a consulta pública por IP', async () => {
        const statuses: number[] = [];
        for (let attempt: number = 0; attempt < 31; attempt += 1) {
            statuses.push((await request('GET', `/signup-links/${'y'.repeat(32)}`)).status);
        }

        expect(statuses.slice(0, 30).every((status: number) => status === 404)).toBe(true);
        expect(statuses[30]).toBe(429);
    });
});
