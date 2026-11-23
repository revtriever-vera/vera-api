import { AddressInfo, Server } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, inject } from 'vitest';
import { AppModule } from '../../../src/app.module';
import { AppContext } from '../../../src/core/context/app-context.port';
import { InvalidGoogleTokenError, PlatformSeedRefusedError } from '../../../src/modules/identity/domain/identity.errors';
import { LoginProvider, PlatformSeedOutcome, SocialIdentity } from '../../../src/modules/identity/domain/identity.types';
import { SocialIdentityVerifierPort } from '../../../src/modules/identity/ports/social-identity-verifier.port';
import { GoogleIdentityVerifier } from '../../../src/modules/identity/services/google-identity.verifier';
import { PlatformSeedService } from '../../../src/modules/identity/services/platform-seed.service';
import { createIsolatedDatabase, IsolatedDatabase } from '../support/isolated-database';
import { isolateRedisForWorker } from '../support/queue';

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
    readonly user: { id: string; email: string; companyId: string };
}

interface ProblemBody {
    readonly type: string;
}

interface AuditBody {
    readonly items: readonly { action: string; operatorUserId: string | null; meta: Record<string, unknown> }[];
}

interface Booted {
    readonly app: INestApplication;
    readonly origin: string;
    readonly isolated: IsolatedDatabase;
    readonly pg: Client;
}

const COOKIE_NAME: string = 'rt_refresh';
const GOOGLE: FakeGoogle = new FakeGoogle();

async function boot(label: string, deploymentMode: string): Promise<Booted> {
    const isolated: IsolatedDatabase = await createIsolatedDatabase(label);
    process.env['DATABASE_URL'] = isolated.url;
    await isolateRedisForWorker(inject('redisNode'));
    process.env['NODE_ENV'] = 'test';
    process.env['IS_LOCAL'] = 'true';
    process.env['DEPLOY_ENV'] = 'local';
    process.env['DEPLOYMENT_MODE'] = deploymentMode;
    const testing: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(GoogleIdentityVerifier)
        .useValue(GOOGLE)
        .compile();
    const app: INestApplication = testing.createNestApplication();
    app.use(cookieParser());
    await app.init();
    await app.listen(0);
    const address: AddressInfo = (app.getHttpServer() as Server).address() as AddressInfo;
    const pg: Client = new Client({ connectionString: isolated.url });
    await pg.connect();
    return { app, origin: `http://127.0.0.1:${String(address.port)}`, isolated, pg };
}

async function stop(booted: Booted): Promise<void> {
    await booted.pg.end();
    await booted.app.close();
    await booted.isolated.drop();
}

function seedOf(booted: Booted, email: string): Promise<PlatformSeedOutcome> {
    const context: AppContext = booted.app.get(AppContext);
    return context.run({ requestId: 'seed', locale: 'pt-BR' }, async () => booted.app.get(PlatformSeedService).seed(email));
}

function post(booted: Booted, path: string, body: unknown, token?: string): Promise<Response> {
    return fetch(`${booted.origin}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body)
    });
}

function get(booted: Booted, path: string, token?: string): Promise<Response> {
    return fetch(`${booted.origin}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
}

async function count(booted: Booted, table: string): Promise<number> {
    const result = await booted.pg.query<{ total: string }>(`SELECT count(*) AS total FROM "${table}"`);
    return Number(result.rows[0]?.total);
}

describe('company de sistema e admin (hospedada)', () => {
    let booted: Booted;
    const adminEmail: string = `admin-${crypto.randomUUID()}@example.test`;

    beforeAll(async () => {
        booted = await boot('platform_hosted', 'hosted');
    });

    afterAll(async () => {
        await stop(booted);
    });

    beforeEach(async () => {
        GOOGLE.enabled = true;
        await booted.pg.query('DELETE FROM "Throttles"');
    });

    async function adminLogin(email: string = adminEmail, subject: string = 'g-admin'): Promise<Response> {
        return post(booted, '/auth/google', { idToken: GOOGLE.register({ subject, email, name: 'Admin' }), audience: 'admin' });
    }

    it('o seed cria a company de sistema e o usuário; rodar de novo não faz nada; outro admin entra na mesma company', async () => {
        expect(await seedOf(booted, adminEmail)).toBe('created');
        const flagged = await booted.pg.query<{ name: string }>('SELECT name FROM "Companies" WHERE "isPlatform" = true');
        expect(flagged.rows.map((row) => row.name)).toEqual(['Vera (sistema)']);
        const users: number = await count(booted, 'Users');

        expect(await seedOf(booted, adminEmail.toUpperCase())).toBe('unchanged');
        expect(await count(booted, 'Users')).toBe(users);

        expect(await seedOf(booted, `outro-${adminEmail}`)).toBe('created');
        const companies = await booted.pg.query<{ total: string }>('SELECT count(*) AS total FROM "Companies" WHERE "isPlatform" = true');
        expect(Number(companies.rows[0]?.total)).toBe(1);
    });

    it('o banco recusa uma segunda company de sistema viva', async () => {
        await expect(
            booted.pg.query(`INSERT INTO "Companies" (id, name, "isPlatform") VALUES ($1, 'Outra', true)`, [crypto.randomUUID()])
        ).rejects.toMatchObject({ code: '23505' });
    });

    it('o login admin do e-mail semeado entra como o usuário semeado, sem nascer company, com o claim platform e a trilha', async () => {
        const companies: number = await count(booted, 'Companies');

        const response: Response = await adminLogin();
        const body = (await response.json()) as LoginBody;

        expect(response.status).toBe(200);
        expect(await count(booted, 'Companies')).toBe(companies);
        expect(body.user.email).toBe(adminEmail.toLowerCase());
        expect((jwt.decode(body.accessToken) as jwt.JwtPayload)['platform']).toBe(true);
        const audit = (await (await get(booted, '/platform/audit', body.accessToken)).json()) as AuditBody;
        expect(audit.items[0]).toMatchObject({ action: 'admin.login', operatorUserId: body.user.id });
    });

    it('o refresh da sessão admin mantém o claim e a rota continua aberta', async () => {
        const login: Response = await adminLogin();
        const cookie: string = login.headers.getSetCookie().find((entry: string) => entry.startsWith(`${COOKIE_NAME}=`)) ?? '';

        const refreshed: Response = await fetch(`${booted.origin}/auth/refresh`, {
            method: 'POST',
            headers: { cookie: cookie.split(';')[0] ?? '' }
        });
        const body = (await refreshed.json()) as LoginBody;

        expect(refreshed.status).toBe(200);
        expect((jwt.decode(body.accessToken) as jwt.JwtPayload)['platform']).toBe(true);
        expect((await get(booted, '/platform/audit', body.accessToken)).status).toBe(200);
    });

    it('quem não é da company de sistema leva 403, não ganha company nem sessão e deixa admin.denied', async () => {
        const credential: string = GOOGLE.register({ subject: 'g-stranger', email: `stranger-${crypto.randomUUID()}@example.test` });
        const before = { companies: await count(booted, 'Companies'), sessions: await count(booted, 'Sessions') };

        const response: Response = await post(booted, '/auth/google', { idToken: credential, audience: 'admin' });

        expect(response.status).toBe(403);
        expect(((await response.json()) as ProblemBody).type).toBe('identity.platform_only');
        expect({ companies: await count(booted, 'Companies'), sessions: await count(booted, 'Sessions') }).toEqual(before);
        const denied = await booted.pg.query<{ meta: { reason: string }; operatorUserId: string | null }>(
            `SELECT meta, "operatorUserId" FROM "PlatformAuditLog" WHERE action = 'admin.denied'`
        );
        expect(denied.rows[0]).toMatchObject({ operatorUserId: null, meta: { reason: 'not_platform_user' } });
    });

    it('a pessoa de uma conta comum não abre /platform; sem token é 401', async () => {
        const login = (await (
            await post(booted, '/auth/google', {
                idToken: GOOGLE.register({ subject: 'g-common', email: `common-${crypto.randomUUID()}@example.test`, name: 'Comum' })
            })
        ).json()) as LoginBody;

        const forbidden: Response = await get(booted, '/platform/audit', login.accessToken);
        const anonymous: Response = await get(booted, '/platform/audit');

        expect(forbidden.status).toBe(403);
        expect(((await forbidden.json()) as ProblemBody).type).toBe('identity.platform_only');
        expect(anonymous.status).toBe(401);
    });

    it('a pessoa da company de sistema não entra pela audiência do app', async () => {
        const credential: string = GOOGLE.register({ subject: 'g-admin', email: adminEmail, name: 'Admin' });

        const response: Response = await post(booted, '/auth/google', { idToken: credential });

        expect(response.status).toBe(403);
        expect(((await response.json()) as ProblemBody).type).toBe('identity.admin_audience_required');
    });

    it('convite para a company de sistema e a exclusão dela são recusados', async () => {
        const login = (await (await adminLogin()).json()) as LoginBody;

        const invite: Response = await post(
            booted,
            '/members/invites',
            { email: 'novo-admin@example.test', role: 'editor' },
            login.accessToken
        );
        const removal: Response = await fetch(`${booted.origin}/account`, {
            method: 'DELETE',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${login.accessToken}` },
            body: JSON.stringify({ confirmEmail: login.user.email })
        });

        expect(invite.status).toBe(403);
        expect(((await invite.json()) as ProblemBody).type).toBe('invites.platform_company');
        expect(removal.status).toBe(403);
        expect(((await removal.json()) as ProblemBody).type).toBe('identity.platform_company_protected');
        expect(await count(booted, 'AccountInvites')).toBe(0);
    });
});

describe('auto-hospedada sem admin', () => {
    let booted: Booted;

    beforeAll(async () => {
        booted = await boot('platform_self_hosted', 'self_hosted');
    });

    afterAll(async () => {
        await stop(booted);
        process.env['DEPLOYMENT_MODE'] = 'hosted';
    });

    it('/platform responde 404, até sem token', async () => {
        const response: Response = await get(booted, '/platform/audit');

        expect(response.status).toBe(404);
        expect(((await response.json()) as ProblemBody).type).toBe('identity.platform_disabled');
    });

    it('a audiência admin é recusada com 404, sem criar nada', async () => {
        const credential: string = GOOGLE.register({ subject: 'g-sh', email: `sh-${crypto.randomUUID()}@example.test`, name: 'Sh' });
        const companies: number = await count(booted, 'Companies');

        const response: Response = await post(booted, '/auth/google', { idToken: credential, audience: 'admin' });

        expect(response.status).toBe(404);
        expect(await count(booted, 'Companies')).toBe(companies);
        expect(await count(booted, 'PlatformAuditLog')).toBe(0);
    });

    it('o seed recusa rodar', async () => {
        await expect(seedOf(booted, 'admin@example.test')).rejects.toBeInstanceOf(PlatformSeedRefusedError);
        expect(await count(booted, 'Companies')).toBe(0);
    });
});
