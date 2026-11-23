import { AddressInfo, Server } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { authenticator } from 'otplib';
import jwt from 'jsonwebtoken';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, inject } from 'vitest';
import { AppModule } from '../../../src/app.module';
import { AppContext } from '../../../src/core/context/app-context.port';
import { InvalidGoogleTokenError, PlatformSeedRefusedError } from '../../../src/modules/identity/domain/identity.errors';
import { LoginProvider, PlatformSeedOutcome, SocialIdentity } from '../../../src/modules/identity/domain/identity.types';
import { SocialIdentityVerifierPort } from '../../../src/modules/identity/ports/social-identity-verifier.port';
import { GoogleIdentityVerifier } from '../../../src/modules/identity/services/google-identity.verifier';
import { TokenService } from '../../../src/modules/identity/services/token.service';
import { PlatformSeedService } from '../../../src/modules/identity/services/platform-seed.service';
import { MailerPort } from '../../../src/core/mail/mailer.port';
import { CapturingMailer } from '../support/capturing-mailer';
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
const MAILER: CapturingMailer = new CapturingMailer();
const STEP_MS: number = 30_000;

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
        .overrideProvider(MailerPort)
        .useValue(MAILER)
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

interface StepBody {
    readonly outcome: string;
    readonly setupToken?: string;
    readonly challengeToken?: string;
    readonly accessToken?: string;
    readonly recoveryCodes?: readonly string[];
    readonly secret?: string;
    readonly otpauthUri?: string;
}

function currentCode(secret: string): string {
    return authenticator.clone({ epoch: Date.now() }).generate(secret);
}

function previousCode(secret: string): string {
    return authenticator.clone({ epoch: Date.now() - 2 * STEP_MS }).generate(secret);
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

    const second: { secret: string; recovery: string[] } = { secret: '', recovery: [] };

    function googleAdmin(email: string, subject: string): Promise<Response> {
        return post(booted, '/auth/google', { idToken: GOOGLE.register({ subject, email, name: 'Admin' }), audience: 'admin' });
    }

    async function adminLogin(email: string = adminEmail, subject: string = 'g-admin'): Promise<Response> {
        const step = (await (await googleAdmin(email, subject)).json()) as StepBody;
        if (step.outcome === 'totp_enrollment_required') {
            const enrolled = (await (await post(booted, '/auth/totp/enroll', { setupToken: step.setupToken })).json()) as StepBody;
            second.secret = enrolled.secret ?? '';
            const activated: Response = await post(booted, '/auth/totp/activate', {
                setupToken: step.setupToken,
                code: currentCode(second.secret)
            });
            second.recovery = [...(((await activated.clone().json()) as StepBody).recoveryCodes ?? [])];
            return activated;
        }
        return post(booted, '/auth/totp/verify', { challengeToken: step.challengeToken, code: second.recovery.shift() });
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
        expect(audit.items.find((item) => item.action === 'admin.login')).toMatchObject({ operatorUserId: body.user.id });
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

    describe('segundo fator TOTP', () => {
        interface Admin {
            readonly email: string;
            readonly subject: string;
        }

        async function freshAdmin(): Promise<Admin> {
            const email: string = `totp-${crypto.randomUUID()}@example.test`;
            await seedOf(booted, email);
            return { email, subject: `g-${email}` };
        }

        async function step(admin: Admin): Promise<StepBody> {
            return (await (await googleAdmin(admin.email, admin.subject)).json()) as StepBody;
        }

        async function enrolled(admin: Admin): Promise<{ secret: string; setupToken: string }> {
            const first: StepBody = await step(admin);
            const setupToken: string = first.setupToken ?? '';
            const enroll = (await (await post(booted, '/auth/totp/enroll', { setupToken })).json()) as StepBody;
            return { secret: enroll.secret ?? '', setupToken };
        }

        async function activated(admin: Admin): Promise<{ secret: string; codes: readonly string[]; body: StepBody }> {
            const pending = await enrolled(admin);
            const response: Response = await post(booted, '/auth/totp/activate', {
                setupToken: pending.setupToken,
                code: currentCode(pending.secret)
            });
            const body = (await response.json()) as StepBody;
            return { secret: pending.secret, codes: body.recoveryCodes ?? [], body };
        }

        async function auditActions(): Promise<string[]> {
            const rows = await booted.pg.query<{ action: string }>('SELECT action FROM "PlatformAuditLog" ORDER BY "createdAt", id');
            return rows.rows.map((row) => row.action);
        }

        it('o login admin não devolve sessão: sem autenticador vem o token de cadastro, e nada é gravado como login', async () => {
            const admin: Admin = await freshAdmin();
            const sessions: number = await count(booted, 'Sessions');
            const logins: number = (await auditActions()).filter((action: string) => action === 'admin.login').length;

            const response: Response = await googleAdmin(admin.email, admin.subject);
            const body = (await response.json()) as StepBody;

            expect(response.status).toBe(200);
            expect(body.outcome).toBe('totp_enrollment_required');
            expect(body.accessToken).toBeUndefined();
            expect(response.headers.getSetCookie().some((entry: string) => entry.startsWith(`${COOKIE_NAME}=`))).toBe(false);
            expect(await count(booted, 'Sessions')).toBe(sessions);
            expect((await auditActions()).filter((action: string) => action === 'admin.login')).toHaveLength(logins);
        });

        it('o cadastro devolve segredo e URI otpauth, e o segredo fica cifrado no banco', async () => {
            const admin: Admin = await freshAdmin();

            const pending = await enrolled(admin);
            const stored = await booted.pg.query<{ secretEncrypted: string; activatedAt: Date | null }>(
                'SELECT "secretEncrypted", "activatedAt" FROM "UserTotps"'
            );

            expect(pending.secret).toMatch(/^[A-Z2-7]+$/);
            expect(stored.rows.some((row) => row.activatedAt === null && !row.secretEncrypted.includes(pending.secret))).toBe(true);
            const again = (await (await post(booted, '/auth/totp/enroll', { setupToken: pending.setupToken })).json()) as StepBody;
            expect(again.otpauthUri).toContain('otpauth://totp/Vera%20admin:');
            expect(again.otpauthUri).toContain('issuer=Vera%20admin');
            expect(again.secret).not.toBe(pending.secret);
        });

        it('a ativação com código errado leva 401; com o código certo traz dez códigos de recuperação em hash, a sessão, o e-mail e a trilha', async () => {
            const admin: Admin = await freshAdmin();
            const pending = await enrolled(admin);

            const wrong: Response = await post(booted, '/auth/totp/activate', {
                setupToken: pending.setupToken,
                code: previousCode(pending.secret)
            });
            expect(wrong.status).toBe(401);
            expect(((await wrong.json()) as ProblemBody).type).toBe('identity.invalid_totp_code');

            const right: Response = await post(booted, '/auth/totp/activate', {
                setupToken: pending.setupToken,
                code: currentCode(pending.secret)
            });
            const body = (await right.json()) as StepBody & LoginBody;

            expect(right.status).toBe(200);
            expect(body.recoveryCodes).toHaveLength(10);
            expect((jwt.decode(body.accessToken) as jwt.JwtPayload)['platform']).toBe(true);
            expect((await get(booted, '/platform/audit', body.accessToken)).status).toBe(200);
            const hashes = await booted.pg.query<{ codeHash: string }>('SELECT "codeHash" FROM "UserRecoveryCodes" WHERE "userId" = $1', [
                body.user.id
            ]);
            expect(hashes.rowCount).toBe(10);
            for (const code of body.recoveryCodes ?? []) {
                expect(hashes.rows.map((row) => row.codeHash)).not.toContain(code);
            }
            expect(MAILER.latestFor(admin.email).template).toBe('admin-totp-activated');
            const actions: string[] = await auditActions();
            expect(actions).toContain('admin.totp_enrolled');
            expect(actions.at(-1)).toBe('admin.login');
        });

        it('com autenticador ativo o login pede o desafio; o código só vale uma vez e o token do desafio não abre a API', async () => {
            const admin: Admin = await freshAdmin();
            const { secret } = await activated(admin);

            const challenge: StepBody = await step(admin);
            expect(challenge.outcome).toBe('totp_required');
            expect(challenge.accessToken).toBeUndefined();
            const opened: Response = await get(booted, '/platform/audit', challenge.challengeToken);
            expect(opened.status).toBe(401);

            const replay: Response = await post(booted, '/auth/totp/verify', {
                challengeToken: challenge.challengeToken,
                code: currentCode(secret)
            });
            expect(replay.status).toBe(401);
            expect(((await replay.json()) as ProblemBody).type).toBe('identity.invalid_totp_code');
        });

        it('o código do passo seguinte e o de duas janelas atrás são recusados', async () => {
            const admin: Admin = await freshAdmin();
            const { secret } = await activated(admin);
            const challenge: StepBody = await step(admin);
            const future: string = authenticator.clone({ epoch: Date.now() + STEP_MS }).generate(secret);

            const early: Response = await post(booted, '/auth/totp/verify', { challengeToken: challenge.challengeToken, code: future });
            const stale: Response = await post(booted, '/auth/totp/verify', {
                challengeToken: challenge.challengeToken,
                code: previousCode(secret)
            });

            expect(early.status).toBe(401);
            expect(stale.status).toBe(401);
        });

        it('código de recuperação entra uma vez só, avisa por e-mail e grava admin.recovery_code_used', async () => {
            const admin: Admin = await freshAdmin();
            const { codes } = await activated(admin);
            const challenge: StepBody = await step(admin);
            const code: string = (codes[0] ?? '').toUpperCase().replace('-', ' ');

            const used: Response = await post(booted, '/auth/totp/verify', { challengeToken: challenge.challengeToken, code });
            const body = (await used.json()) as LoginBody;

            expect(used.status).toBe(200);
            expect((jwt.decode(body.accessToken) as jwt.JwtPayload)['platform']).toBe(true);
            expect(MAILER.latestFor(admin.email).template).toBe('admin-recovery-code-used');
            expect(await auditActions()).toContain('admin.recovery_code_used');
            const second: StepBody = await step(admin);
            const again: Response = await post(booted, '/auth/totp/verify', { challengeToken: second.challengeToken, code: codes[0] });
            expect(again.status).toBe(401);
        });

        it('cinco tentativas em 15 minutos e a sexta leva 429 com admin.totp_locked, mesmo com o código certo', async () => {
            const admin: Admin = await freshAdmin();
            const { secret } = await activated(admin);
            await booted.pg.query('DELETE FROM "Throttles"');
            const challenge: StepBody = await step(admin);
            const attempt = (code: string): Promise<Response> =>
                post(booted, '/auth/totp/verify', { challengeToken: challenge.challengeToken, code });

            for (let index: number = 0; index < 5; index += 1) {
                expect((await attempt('zzzzz-zzzzz')).status).toBe(401);
            }
            const locked: Response = await attempt('zzzzz-zzzzz');
            const right: Response = await attempt(authenticator.clone({ epoch: Date.now() + STEP_MS }).generate(secret));

            expect(locked.status).toBe(429);
            expect(((await locked.json()) as ProblemBody).type).toBe('core.too_many_attempts');
            expect(right.status).toBe(429);
            expect((await auditActions()).filter((action: string) => action === 'admin.totp_locked')).toHaveLength(1);
        });

        it('cada token só serve ao seu passo, e sem token a rota responde 401', async () => {
            const admin: Admin = await freshAdmin();
            const setup: StepBody = await step(admin);

            const wrongStep: Response = await post(booted, '/auth/totp/verify', { challengeToken: setup.setupToken, code: '123456' });
            const forged: Response = await post(booted, '/auth/totp/enroll', { setupToken: 'x'.repeat(40) });

            expect(wrongStep.status).toBe(401);
            expect(((await wrongStep.json()) as ProblemBody).type).toBe('identity.invalid_totp_token');
            expect(forged.status).toBe(401);
        });

        it('quem já tem autenticador ativo não recadastra, nem com um token de cadastro válido', async () => {
            const admin: Admin = await freshAdmin();
            const { body } = await activated(admin);
            const user = (body as unknown as LoginBody).user;
            const setupToken: string = booted.app.get(TokenService).signSecondFactorToken('totp_enrollment', user.id, user.companyId);

            const response: Response = await post(booted, '/auth/totp/enroll', { setupToken });

            expect(response.status).toBe(409);
            expect(((await response.json()) as ProblemBody).type).toBe('identity.totp_already_active');
        });

        it('o token de desafio não serve para cadastrar', async () => {
            const admin: Admin = await freshAdmin();
            await activated(admin);
            const challenge: StepBody = await step(admin);

            const response: Response = await post(booted, '/auth/totp/enroll', { setupToken: challenge.challengeToken });

            expect(response.status).toBe(401);
        });

        it('zerar pelo seed apaga o autenticador, revoga as sessões, audita e o próximo login cadastra de novo', async () => {
            const admin: Admin = await freshAdmin();
            const { body } = await activated(admin);
            const context: AppContext = booted.app.get(AppContext);

            const outcome: string = await context.run({ requestId: 'seed', locale: 'pt-BR' }, async () =>
                booted.app.get(PlatformSeedService).resetTotp(admin.email)
            );

            expect(outcome).toBe('reset');
            expect(await auditActions()).toContain('admin.totp_reset');
            const live = await booted.pg.query<{ total: string }>(
                'SELECT count(*) AS total FROM "Sessions" WHERE "userId" = $1 AND "revokedAt" IS NULL',
                [(body as unknown as LoginBody).user.id]
            );
            expect(Number(live.rows[0]?.total)).toBe(0);
            const remaining = await booted.pg.query<{ total: string }>(
                'SELECT count(*) AS total FROM "UserTotps" WHERE "deletedAt" IS NULL AND "userId" = $1',
                [(body as unknown as LoginBody).user.id]
            );
            expect(Number(remaining.rows[0]?.total)).toBe(0);
            expect((await step(admin)).outcome).toBe('totp_enrollment_required');
            const common: string = await context.run({ requestId: 'seed', locale: 'pt-BR' }, async () =>
                booted.app.get(PlatformSeedService).resetTotp('ninguem@example.test')
            );
            expect(common).toBe('not_found');
        });
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

    it('os passos do TOTP respondem 404', async () => {
        const response: Response = await post(booted, '/auth/totp/verify', { challengeToken: 'x'.repeat(40), code: '123456' });

        expect(response.status).toBe(404);
        expect(((await response.json()) as ProblemBody).type).toBe('identity.platform_disabled');
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
