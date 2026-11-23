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
    readonly offerValidityDays: number;
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

    it('a validade da oferta vem do link (30 dias por padrão) e define o vencimento do resgate', async () => {
        const standard = (await (await createLink({ label: 'Padrão', trial: { kind: 'none', days: null } })).json()) as LinkBody;
        const custom = (await (
            await createLink({ label: 'Dez dias', trial: { kind: 'none', days: null }, offerValidityDays: 10 })
        ).json()) as LinkBody;

        expect(standard.offerValidityDays).toBe(30);
        expect(custom.offerValidityDays).toBe(10);
        expect((await createLink({ label: 'Zero', trial: { kind: 'none', days: null }, offerValidityDays: 0 })).status).toBe(400);
        const account = (await (
            await request('POST', '/auth/google', {
                idToken: GOOGLE.register({
                    subject: `g-${crypto.randomUUID()}`,
                    email: `ana-${crypto.randomUUID()}@example.test`,
                    name: 'Ana'
                })
            })
        ).json()) as LoginBody;
        expect((await request('POST', '/billing/offer/redeem', { token: custom.token }, account.accessToken)).status).toBe(200);
        const row = await pg.query<{ days: number }>(
            `SELECT round(extract(epoch FROM ("expiresAt" - "redeemedAt")) / 86400)::int AS days FROM "SignupRedemptions" WHERE "signupLinkId" = $1`,
            [custom.id]
        );
        expect(row.rows[0]?.days).toBe(10);
    });

    it('editar o link muda o que vale para resgates novos e para ofertas resgatadas e não aplicadas, e audita antes e depois', async () => {
        const created = (await (
            await createLink({
                label: 'Editável',
                trial: { kind: 'card', days: 7 },
                rules: [{ percent: 10, fromCycle: 1, toCycle: 2 }],
                offerValidityDays: 30
            })
        ).json()) as LinkBody;
        const pending = (await (
            await request('POST', '/auth/google', {
                idToken: GOOGLE.register({ subject: `g-${crypto.randomUUID()}`, email: `p-${crypto.randomUUID()}@example.test`, name: 'P' })
            })
        ).json()) as LoginBody;
        const applied = (await (
            await request('POST', '/auth/google', {
                idToken: GOOGLE.register({ subject: `g-${crypto.randomUUID()}`, email: `a-${crypto.randomUUID()}@example.test`, name: 'A' })
            })
        ).json()) as LoginBody;
        expect((await request('POST', '/billing/offer/redeem', { token: created.token }, pending.accessToken)).status).toBe(200);
        expect((await request('POST', '/billing/offer/redeem', { token: created.token }, applied.accessToken)).status).toBe(200);
        await pg.query(
            `UPDATE "SignupRedemptions" SET "appliedAt" = now() WHERE "companyId" = (SELECT "companyId" FROM "Users" WHERE id = $1)`,
            [applied.user.id]
        );

        const response: Response = await request(
            'PATCH',
            `/platform/signup-links/${created.id}`,
            {
                label: 'Editado',
                trial: { kind: 'card', days: 21 },
                rules: [{ percent: 40, fromCycle: 1, toCycle: 3 }],
                offerValidityDays: 15
            },
            adminToken
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            id: created.id,
            token: created.token,
            label: 'Editado',
            trial: { kind: 'card', days: 21 },
            rules: [{ percent: 40, fromCycle: 1, toCycle: 3 }],
            offerValidityDays: 15,
            redemptionCount: 2
        });
        const rows = await pg.query<{ trialDays: number; percent: number; days: number; applied: boolean }>(
            `SELECT r."trialDays", (r.rules->0->>'percent')::int AS percent,
                    round(extract(epoch FROM (r."expiresAt" - r."redeemedAt")) / 86400)::int AS days, r."appliedAt" IS NOT NULL AS applied
               FROM "SignupRedemptions" r WHERE r."signupLinkId" = $1 ORDER BY applied`,
            [created.id]
        );
        expect(rows.rows).toEqual([
            { trialDays: 21, percent: 40, days: 15, applied: false },
            { trialDays: 7, percent: 10, days: 30, applied: true }
        ]);
        const audit = (await (await request('GET', '/platform/audit?limit=200', undefined, adminToken)).json()) as AuditBody;
        const entry = audit.items.find((item) => item.action === 'signup_link.updated');
        expect(entry).toMatchObject({
            operatorUserId: adminId,
            meta: {
                linkId: created.id,
                before: { label: 'Editável', offerValidityDays: 30 },
                after: { label: 'Editado', offerValidityDays: 15 }
            }
        });
    });

    it('editar sem mudar nada não grava nem audita; editar exige as mesmas regras da criação', async () => {
        const created = (await (
            await createLink({ label: 'Regras', trial: { kind: 'no_card', days: 7 }, maxUses: 5, expiresAt: inDays(10) })
        ).json()) as LinkBody;
        const updates = async (): Promise<number> => (await auditActions()).filter((action) => action === 'signup_link.updated').length;
        const before: number = await updates();

        const same: Response = await request('PATCH', `/platform/signup-links/${created.id}`, { label: 'Regras' }, adminToken);
        const noLimit: Response = await request('PATCH', `/platform/signup-links/${created.id}`, { maxUses: null }, adminToken);
        const noExpiry: Response = await request('PATCH', `/platform/signup-links/${created.id}`, { expiresAt: null }, adminToken);
        const past: Response = await request('PATCH', `/platform/signup-links/${created.id}`, { expiresAt: inDays(-1) }, adminToken);
        const tooFar: Response = await request('PATCH', `/platform/signup-links/${created.id}`, { expiresAt: inDays(91) }, adminToken);
        const toNone: Response = await request(
            'PATCH',
            `/platform/signup-links/${created.id}`,
            { trial: { kind: 'none', days: null }, maxUses: null, expiresAt: null },
            adminToken
        );

        expect(same.status).toBe(200);
        expect(await updates()).toBe(before + 1);
        expect(((await noLimit.json()) as ProblemBody).meta?.reason).toBe('no_card_requires_max_uses');
        expect(((await noExpiry.json()) as ProblemBody).meta?.reason).toBe('no_card_requires_expiry');
        expect(((await past.json()) as ProblemBody).meta?.reason).toBe('expires_in_the_past');
        expect(((await tooFar.json()) as ProblemBody).meta?.reason).toBe('no_card_expiry_too_far');
        expect(toNone.status).toBe(200);
    });

    it('editar um link que não existe é 404 e quem não é da plataforma não edita', async () => {
        const common = (await (
            await request('POST', '/auth/google', {
                idToken: GOOGLE.register({ subject: `g-${crypto.randomUUID()}`, email: `c-${crypto.randomUUID()}@example.test`, name: 'C' })
            })
        ).json()) as LoginBody;
        const id: string = crypto.randomUUID();

        const missing: Response = await request('PATCH', `/platform/signup-links/${id}`, { label: 'x' }, adminToken);

        expect(missing.status).toBe(404);
        expect(((await missing.json()) as ProblemBody).type).toBe('signup_links.not_found');
        expect((await request('PATCH', `/platform/signup-links/${id}`, { label: 'x' }, common.accessToken)).status).toBe(403);
        expect((await request('PATCH', `/platform/signup-links/${id}`, { label: 'x' })).status).toBe(401);
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
        const edit: Response = await request('PATCH', `/platform/signup-links/${created.id}`, { label: 'Depois de revogar' }, adminToken);
        expect(edit.status).toBe(409);
        expect(((await edit.json()) as ProblemBody).type).toBe('signup_links.revoked');
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
