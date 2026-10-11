import { AddressInfo, Server } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { AppModule } from '../../../src/app.module';
import { AppContext } from '../../../src/core/context/app-context.port';
import { AppLocale } from '../../../src/shared/i18n/locale';
import { HashUtil } from '../../../src/shared/utils/hash.util';
import { CompanyDomain } from '../../../src/modules/identity/domain/company.domain';
import { Company, Session, User } from '../../../src/modules/identity/domain/identity.types';
import { SessionDomain } from '../../../src/modules/identity/domain/session.domain';
import { UserDomain } from '../../../src/modules/identity/domain/user.domain';
import { AuthTokens, SessionIssuerPort } from '../../../src/modules/identity/ports/session-issuer.port';
import { createIsolatedDatabase, IsolatedDatabase } from '../support/isolated-database';
import { isolateRedisForWorker } from '../support/queue';

interface Account {
    readonly company: Company;
    readonly user: User;
    readonly tokens: AuthTokens;
}

interface ProblemBody {
    readonly type: string;
    readonly status: number;
}

interface MeBody {
    readonly userId: string;
    readonly companyId: string;
    readonly name: string;
    readonly email: string;
    readonly role: string;
    readonly locale: string;
    readonly preferredLocale: string | null;
    readonly loginProvider: string;
    readonly companyName: string;
}

interface SessionRow {
    readonly id: string;
    readonly familyId: string;
    readonly replacedById: string | null;
    readonly revokedAt: Date | null;
    readonly provider: string;
}

const COOKIE_NAME: string = 'rt_refresh';

describe('identity session flow', () => {
    let app: INestApplication;
    let origin: string;
    let isolated: IsolatedDatabase;
    let pg: Client;
    let context: AppContext;
    let companies: CompanyDomain;
    let users: UserDomain;
    let sessions: SessionDomain;
    let issuer: SessionIssuerPort;

    beforeAll(async () => {
        isolated = await createIsolatedDatabase('identity');
        process.env['DATABASE_URL'] = isolated.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';

        const testing: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = testing.createNestApplication();
        app.use(cookieParser());
        await app.init();
        await app.listen(0);
        const address: AddressInfo = (app.getHttpServer() as Server).address() as AddressInfo;
        origin = `http://127.0.0.1:${String(address.port)}`;

        context = app.get(AppContext);
        companies = app.get(CompanyDomain, { strict: false });
        users = app.get(UserDomain, { strict: false });
        sessions = app.get(SessionDomain, { strict: false });
        issuer = app.get(SessionIssuerPort, { strict: false });
        pg = new Client({ connectionString: isolated.url });
        await pg.connect();
    });

    afterAll(async () => {
        await pg.end();
        await app.close();
        await isolated.drop();
    });

    const inCompany = async <T>(companyId: string, fn: () => Promise<T>): Promise<T> =>
        context.run({ requestId: 'test', companyId, locale: 'pt-BR' }, fn);

    async function signUp(label: string, locale: AppLocale = 'pt-BR', provider: 'google' | 'facebook' = 'google'): Promise<Account> {
        const company: Company = await companies.create({ name: `Empresa ${label}`, locale });
        const email: string = `${label}-${crypto.randomUUID()}@example.com`;
        const user: User = await inCompany(company.id, async () =>
            users.createOwner({ email, name: `Pessoa ${label}`, emailVerifiedAt: new Date(), termsAcceptedAt: new Date() })
        );
        const tokens: AuthTokens = await inCompany(company.id, async () =>
            issuer.issueForNewLogin(user, { ip: '203.0.113.7', userAgent: 'int-test' }, provider)
        );
        return { company, user, tokens };
    }

    async function post(path: string, cookie?: string): Promise<Response> {
        return fetch(`${origin}${path}`, { method: 'POST', headers: cookie ? { cookie: `${COOKIE_NAME}=${cookie}` } : {} });
    }

    function cookieOf(response: Response): string | undefined {
        const header: string | undefined = response.headers.getSetCookie().find((entry: string) => entry.startsWith(`${COOKIE_NAME}=`));
        return header?.split(';')[0]?.slice(COOKIE_NAME.length + 1);
    }

    async function me(token: string | null, method: 'GET' | 'PATCH' = 'GET', body?: unknown): Promise<Response> {
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (token) {
            headers['authorization'] = `Bearer ${token}`;
        }
        const path: string = method === 'GET' ? '/auth/me' : '/auth/me/preferences';
        return fetch(`${origin}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    }

    async function familyOf(familyId: string): Promise<SessionRow[]> {
        const result = await pg.query<SessionRow>(
            'SELECT id, "familyId", "replacedById", "revokedAt", provider FROM "Sessions" WHERE "familyId" = $1 ORDER BY "createdAt"',
            [familyId]
        );
        return result.rows;
    }

    async function sessionByRefresh(raw: string): Promise<Session> {
        const hash: string = HashUtil.sha256(raw);
        const result = await pg.query<Session>('SELECT * FROM "Sessions" WHERE "tokenHash" = $1', [hash]);
        return result.rows[0] as Session;
    }

    it('refresh com cookie válido devolve access token, troca o cookie e marca a sessão antiga como substituída', async () => {
        const account: Account = await signUp('refresh', 'pt-BR', 'facebook');
        const old: Session = await sessionByRefresh(account.tokens.refreshToken);

        const response: Response = await post('/auth/refresh', account.tokens.refreshToken);
        const body = (await response.json()) as {
            outcome: string;
            accessToken: string;
            user: Record<string, unknown>;
            refreshToken?: string;
        };

        expect(response.status).toBe(200);
        expect(body.outcome).toBe('authenticated');
        expect(body.accessToken.split('.')).toHaveLength(3);
        expect(body.user).toEqual({
            id: account.user.id,
            name: account.user.name,
            email: account.user.email,
            role: 'owner',
            companyId: account.company.id
        });
        expect(JSON.stringify(body)).not.toContain(account.tokens.refreshToken);
        expect(body.refreshToken).toBeUndefined();

        const rotated: string | undefined = cookieOf(response);
        expect(rotated).toBeDefined();
        expect(rotated).not.toBe(account.tokens.refreshToken);
        const header: string = response.headers.getSetCookie().find((entry: string) => entry.startsWith(COOKIE_NAME)) ?? '';
        expect(header).toContain('HttpOnly');
        expect(header).toContain('Path=/auth');
        expect(header).toContain('SameSite=Lax');

        const family: SessionRow[] = await familyOf(old.familyId);
        expect(family).toHaveLength(2);
        const [previous, current] = family as [SessionRow, SessionRow];
        expect(previous.replacedById).toBe(current.id);
        expect(previous.revokedAt).not.toBeNull();
        expect(current.revokedAt).toBeNull();
        expect(current.provider).toBe('facebook');
    });

    it('reapresentar o cookie antigo devolve 401 e revoga todas as sessões da família', async () => {
        const account: Account = await signUp('reuse');
        const old: Session = await sessionByRefresh(account.tokens.refreshToken);
        const first: Response = await post('/auth/refresh', account.tokens.refreshToken);
        const second: Response = await post('/auth/refresh', cookieOf(first));
        expect(second.status).toBe(200);

        const replay: Response = await post('/auth/refresh', account.tokens.refreshToken);
        const problem = (await replay.json()) as ProblemBody;

        expect(replay.status).toBe(401);
        expect(problem.type).toBe('identity.invalid_refresh');
        const family: SessionRow[] = await familyOf(old.familyId);
        expect(family).toHaveLength(3);
        expect(family.every((row: SessionRow) => row.revokedAt !== null)).toBe(true);
        const afterReuse: Response = await post('/auth/refresh', cookieOf(second));
        expect(afterReuse.status).toBe(401);
    });

    it('refresh sem cookie, com lixo ou com token desconhecido devolve 401 identity.invalid_refresh', async () => {
        for (const cookie of [undefined, 'lixo', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA']) {
            const response: Response = await post('/auth/refresh', cookie);
            expect(response.status).toBe(401);
            expect(((await response.json()) as ProblemBody).type).toBe('identity.invalid_refresh');
        }
    });

    it('duas requisições simultâneas com o mesmo cookie: uma vence e a família é revogada', async () => {
        const account: Account = await signUp('race');
        const old: Session = await sessionByRefresh(account.tokens.refreshToken);

        const [a, b] = await Promise.all([
            post('/auth/refresh', account.tokens.refreshToken),
            post('/auth/refresh', account.tokens.refreshToken)
        ]);

        expect([a.status, b.status].sort()).toEqual([200, 401]);
        const family: SessionRow[] = await familyOf(old.familyId);
        expect(family.filter((row: SessionRow) => row.revokedAt === null).length).toBeLessThanOrEqual(1);
    });

    it('logout revoga a sessão, limpa o cookie e o refresh seguinte devolve 401', async () => {
        const account: Account = await signUp('logout');
        const old: Session = await sessionByRefresh(account.tokens.refreshToken);

        const response: Response = await post('/auth/logout', account.tokens.refreshToken);

        expect(response.status).toBe(204);
        const cleared: string = response.headers.getSetCookie().find((entry: string) => entry.startsWith(COOKIE_NAME)) ?? '';
        expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
        expect(cleared).toContain('Path=/auth');
        const family: SessionRow[] = await familyOf(old.familyId);
        expect(family[0]?.revokedAt).not.toBeNull();
        expect((await post('/auth/refresh', account.tokens.refreshToken)).status).toBe(401);
    });

    it('logout é idempotente: sem cookie, desconhecido ou repetido responde 204', async () => {
        const account: Account = await signUp('logout-twice');

        expect((await post('/auth/logout')).status).toBe(204);
        expect((await post('/auth/logout', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).status).toBe(204);
        expect((await post('/auth/logout', account.tokens.refreshToken)).status).toBe(204);
        expect((await post('/auth/logout', account.tokens.refreshToken)).status).toBe(204);
    });

    it('GET /auth/me sem token, com esquema errado ou com token adulterado devolve 401 identity.unauthorized', async () => {
        const account: Account = await signUp('anon');
        const tampered: string = `${account.tokens.accessToken.slice(0, -3)}abc`;

        for (const response of [
            await me(null),
            await fetch(`${origin}/auth/me`, { headers: { authorization: `Basic ${account.tokens.accessToken}` } }),
            await me(tampered)
        ]) {
            expect(response.status).toBe(401);
            expect(((await response.json()) as ProblemBody).type).toBe('identity.unauthorized');
        }
    });

    it('GET /auth/me devolve identidade, idioma efetivo e provedor da sessão', async () => {
        const account: Account = await signUp('me', 'en', 'facebook');

        const response: Response = await me(account.tokens.accessToken);

        expect(response.status).toBe(200);
        expect((await response.json()) as MeBody).toEqual({
            userId: account.user.id,
            companyId: account.company.id,
            name: account.user.name,
            email: account.user.email,
            role: 'owner',
            locale: 'en',
            preferredLocale: null,
            loginProvider: 'facebook',
            companyName: 'Empresa me'
        });
    });

    it('com duas companies, cada /auth/me só enxerga a própria e a sessão de uma não é achada no contexto da outra', async () => {
        const a: Account = await signUp('tenant-a');
        const b: Account = await signUp('tenant-b');

        const meA = (await (await me(a.tokens.accessToken)).json()) as MeBody;
        const meB = (await (await me(b.tokens.accessToken)).json()) as MeBody;

        expect(meA.companyId).toBe(a.company.id);
        expect(meB.companyId).toBe(b.company.id);
        expect(meA.userId).not.toBe(meB.userId);
        const sessionOfA: Session = await sessionByRefresh(a.tokens.refreshToken);
        const crossRead: Session | null = await inCompany(b.company.id, async () => sessions.findById(sessionOfA.id));
        const ownRead: Session | null = await inCompany(a.company.id, async () => sessions.findById(sessionOfA.id));
        expect(crossRead).toBeNull();
        expect(ownRead?.id).toBe(sessionOfA.id);
        const crossUser: User | null = await inCompany(b.company.id, async () => users.findById(a.user.id));
        expect(crossUser).toBeNull();
    });

    it('PATCH /auth/me/preferences grava o idioma pessoal e null volta a seguir o da company', async () => {
        const account: Account = await signUp('prefs', 'pt-BR');

        const set: Response = await me(account.tokens.accessToken, 'PATCH', { locale: 'en' });
        expect(set.status).toBe(200);
        expect(((await set.json()) as MeBody).preferredLocale).toBe('en');
        const afterSet = (await (await me(account.tokens.accessToken)).json()) as MeBody;
        expect(afterSet.preferredLocale).toBe('en');
        expect(afterSet.locale).toBe('en');

        const refreshed = (await (await post('/auth/refresh', account.tokens.refreshToken)).json()) as { accessToken: string };
        const claims = JSON.parse(Buffer.from(refreshed.accessToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
            locale: string;
        };
        expect(claims.locale).toBe('en');

        const cleared: Response = await me(account.tokens.accessToken, 'PATCH', { locale: null });
        const afterClear = (await cleared.json()) as MeBody;
        expect(cleared.status).toBe(200);
        expect(afterClear.preferredLocale).toBeNull();
        expect(afterClear.locale).toBe('pt-BR');
    });

    it('PATCH /auth/me/preferences rejeita campo extra e idioma inválido com 400, e sem token com 401', async () => {
        const account: Account = await signUp('prefs-bad');

        const extra: Response = await me(account.tokens.accessToken, 'PATCH', { locale: 'en', companyId: crypto.randomUUID() });
        const invalid: Response = await me(account.tokens.accessToken, 'PATCH', { locale: 'fr' });
        const anonymous: Response = await me(null, 'PATCH', { locale: 'en' });

        expect(extra.status).toBe(400);
        expect(invalid.status).toBe(400);
        expect(((await extra.json()) as ProblemBody).type).toBe('validation_failed');
        expect(anonymous.status).toBe(401);
        expect(((await anonymous.json()) as ProblemBody).type).toBe('identity.unauthorized');
    });

    it('refresh de usuário apagado devolve 401 identity.invalid_refresh', async () => {
        const account: Account = await signUp('deleted-user');
        await pg.query('UPDATE "Users" SET "deletedAt" = now() WHERE id = $1', [account.user.id]);

        const response: Response = await post('/auth/refresh', account.tokens.refreshToken);

        expect(response.status).toBe(401);
        expect(((await response.json()) as ProblemBody).type).toBe('identity.invalid_refresh');
    });

    it('refresh de company apagada devolve 401 identity.account_closed', async () => {
        const account: Account = await signUp('deleted-company');
        await pg.query('UPDATE "Companies" SET "deletedAt" = now() WHERE id = $1', [account.company.id]);

        const response: Response = await post('/auth/refresh', account.tokens.refreshToken);

        expect(response.status).toBe(401);
        expect(((await response.json()) as ProblemBody).type).toBe('identity.account_closed');
    });

    it('e-mail é único entre usuários ativos, sem diferenciar maiúsculas', async () => {
        const account: Account = await signUp('unique');
        const other: Company = await companies.create({ name: 'Outra' });

        await expect(
            inCompany(other.id, async () =>
                users.createOwner({
                    email: account.user.email.toUpperCase(),
                    name: 'Duplicada',
                    emailVerifiedAt: null,
                    termsAcceptedAt: null
                })
            )
        ).rejects.toThrow();
        const found: User | null = await users.findByEmailAcrossTenants(account.user.email.toUpperCase());
        expect(found?.id).toBe(account.user.id);
    });
});
