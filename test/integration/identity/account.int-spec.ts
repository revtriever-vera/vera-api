import { AddressInfo, Server } from 'node:net';
import { INestApplication, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, inject } from 'vitest';
import { AppModule } from '../../../src/app.module';
import { AppContext } from '../../../src/core/context/app-context.port';
import { TemplateRegistry } from '../../../src/core/mail/template.registry';
import { QueuePublisherPort } from '../../../src/core/queue/queue.types';
import { AccountDeletionLogDomain } from '../../../src/modules/identity/domain/account-deletion-log.domain';
import { AuthIdentityDomain } from '../../../src/modules/identity/domain/auth-identity.domain';
import { CompanyDomain } from '../../../src/modules/identity/domain/company.domain';
import { AccountDeletionRecord, Company, User } from '../../../src/modules/identity/domain/identity.types';
import { UserDomain } from '../../../src/modules/identity/domain/user.domain';
import { AuthTokens, SessionIssuerPort } from '../../../src/modules/identity/ports/session-issuer.port';
import { AccountDataEraserPort } from '../../../src/modules/identity/services/account-data-eraser.port';
import { PositionsAccountExporter } from '../../../src/modules/positions/services/positions-account.exporter';
import { AccountDataExporterPort } from '../../../src/modules/identity/services/account-data-exporter.port';
import { tablesWithCompanyId } from '../support/company-cascade';
import { createIsolatedDatabase, IsolatedDatabase } from '../support/isolated-database';
import { withoutBusinessPorts } from '../support/inert-ports';
import { CapturingPublisher, isolateRedisForWorker } from '../support/queue';

class ScriptedEraser extends AccountDataEraserPort {
    public failing: boolean = false;
    public readonly erased: string[] = [];

    public constructor(public readonly area: string) {
        super();
    }

    public eraseAll(companyId: string): Promise<number> {
        if (this.failing) {
            return Promise.reject(new Error('eraser unavailable'));
        }
        this.erased.push(companyId);
        return Promise.resolve(this.erased.length);
    }
}

class ScriptedExporter extends AccountDataExporterPort {
    public failing: boolean = false;
    public readonly area: string = 'notes';

    public exportAll(companyId: string): Promise<unknown> {
        if (this.failing) {
            return Promise.reject(new Error('exporter unavailable'));
        }
        return Promise.resolve({ owner: companyId, items: ['item-of-this-company'] });
    }
}

const stableEraser: ScriptedEraser = new ScriptedEraser('stable');
const flakyEraser: ScriptedEraser = new ScriptedEraser('flaky');
const exporter: ScriptedExporter = new ScriptedExporter();

@Module({
    providers: [
        { provide: 'TEST_STABLE_ERASER', useValue: stableEraser },
        { provide: 'TEST_FLAKY_ERASER', useValue: flakyEraser },
        { provide: 'TEST_EXPORTER', useValue: exporter }
    ]
})
class ScriptedAreasModule {}

interface Account {
    readonly company: Company;
    readonly user: User;
    readonly tokens: AuthTokens;
    readonly otherTokens: AuthTokens;
}

interface ProblemBody {
    readonly type: string;
    readonly status: number;
    readonly meta?: { readonly area?: string };
}

interface ExportBody {
    readonly format: string;
    readonly exportedAt: string;
    readonly account: {
        readonly company: { readonly name: string };
        readonly user: { readonly email: string };
        readonly identities: Record<string, unknown>[];
        readonly sessions: Record<string, unknown>[];
    };
    readonly sections: Record<string, unknown>;
}

const COOKIE_NAME: string = 'rt_refresh';

describe('identity account deletion and export', () => {
    let app: INestApplication;
    let origin: string;
    let isolated: IsolatedDatabase;
    let pg: Client;
    let context: AppContext;
    let companies: CompanyDomain;
    let users: UserDomain;
    let identities: AuthIdentityDomain;
    let issuer: SessionIssuerPort;
    let deletionLog: AccountDeletionLogDomain;
    let templates: TemplateRegistry;
    const publisher: CapturingPublisher = new CapturingPublisher();

    beforeAll(async () => {
        isolated = await createIsolatedDatabase('account');
        process.env['DATABASE_URL'] = isolated.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';

        const testing: TestingModule = await withoutBusinessPorts(Test.createTestingModule({ imports: [AppModule, ScriptedAreasModule] }))
            .overrideProvider(QueuePublisherPort)
            .useValue(publisher)
            .overrideProvider(PositionsAccountExporter)
            .useValue({})
            .compile();
        app = testing.createNestApplication();
        app.use(cookieParser());
        await app.init();
        await app.listen(0);
        const address: AddressInfo = (app.getHttpServer() as Server).address() as AddressInfo;
        origin = `http://127.0.0.1:${String(address.port)}`;

        context = app.get(AppContext);
        companies = app.get(CompanyDomain, { strict: false });
        users = app.get(UserDomain, { strict: false });
        identities = app.get(AuthIdentityDomain, { strict: false });
        issuer = app.get(SessionIssuerPort, { strict: false });
        deletionLog = app.get(AccountDeletionLogDomain, { strict: false });
        templates = app.get(TemplateRegistry, { strict: false });
        pg = new Client({ connectionString: isolated.url });
        await pg.connect();
    });

    afterAll(async () => {
        await pg.end();
        await app.close();
        await isolated.drop();
    });

    beforeEach(() => {
        flakyEraser.failing = false;
        exporter.failing = false;
        publisher.published.length = 0;
    });

    const inCompany = async <T>(companyId: string, fn: () => Promise<T>): Promise<T> =>
        context.run({ requestId: 'test', companyId, locale: 'pt-BR' }, fn);

    async function signUp(label: string): Promise<Account> {
        const company: Company = await companies.create({ name: `Empresa ${label}`, locale: 'en' });
        const email: string = `${label}-${crypto.randomUUID()}@example.test`;
        const user: User = await inCompany(company.id, async () =>
            users.createOwner({ email, name: `Pessoa ${label}`, emailVerifiedAt: new Date(), termsAcceptedAt: new Date() })
        );
        await inCompany(company.id, async () =>
            identities.link(user.id, {
                provider: 'google',
                subject: `subject-${crypto.randomUUID()}`,
                email,
                emailVerified: true,
                name: null
            })
        );
        const meta = { ip: '203.0.113.7', userAgent: 'int-test' };
        const tokens: AuthTokens = await inCompany(company.id, async () => issuer.issueForNewLogin(user, meta, 'google'));
        const otherTokens: AuthTokens = await inCompany(company.id, async () => issuer.issueForNewLogin(user, meta, 'google'));
        return { company, user, tokens, otherTokens };
    }

    async function request(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (token) {
            headers['authorization'] = `Bearer ${token}`;
        }
        return fetch(`${origin}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    }

    async function countsOf(companyId: string): Promise<Record<string, number>> {
        const counts: Record<string, number> = {};
        const result = await pg.query<{ count: string }>('SELECT count(*) FROM "Companies" WHERE id = $1', [companyId]);
        counts['Companies'] = Number(result.rows[0]?.count);
        for (const table of await tablesWithCompanyId(pg)) {
            const rows = await pg.query<{ count: string }>(`SELECT count(*) FROM "${table}" WHERE "companyId" = $1`, [companyId]);
            counts[table] = Number(rows.rows[0]?.count);
        }
        return counts;
    }

    it('apaga fisicamente tudo da company A, deixa a B intacta e grava a trilha só com o hash', async () => {
        const a: Account = await signUp('a');
        const b: Account = await signUp('b');
        const beforeA: Record<string, number> = await countsOf(a.company.id);
        const beforeB: Record<string, number> = await countsOf(b.company.id);
        expect(beforeA).toMatchObject({ Companies: 1, Users: 1, AuthIdentities: 1, Sessions: 2 });

        const response: Response = await request('DELETE', '/account', a.tokens.accessToken, {
            confirmEmail: a.user.email.toUpperCase()
        });

        expect(response.status).toBe(204);
        const cleared: string = response.headers.getSetCookie().find((entry: string) => entry.startsWith(`${COOKIE_NAME}=`)) ?? '';
        expect(cleared).toContain('Path=/auth');
        expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
        const afterA: Record<string, number> = await countsOf(a.company.id);
        expect(Object.values(afterA).every((count: number) => count === 0)).toBe(true);
        expect(Object.keys(afterA)).toEqual(Object.keys(beforeA));
        expect(await countsOf(b.company.id)).toEqual(beforeB);
        expect(stableEraser.erased).toContain(a.company.id);
        expect(stableEraser.erased).not.toContain(b.company.id);

        const trail: AccountDeletionRecord[] = await deletionLog.findByCompanyId(a.company.id);
        expect(trail).toHaveLength(1);
        expect(trail[0]?.companyHash).toBe(deletionLog.hashOf(a.company.id));
        expect(trail[0]?.areas).toEqual([
            { area: 'stable', erased: expect.any(Number) },
            { area: 'flaky', erased: expect.any(Number) }
        ]);
        const dump: string = JSON.stringify((await pg.query('SELECT * FROM "AccountDeletionLog"')).rows);
        expect(dump).not.toContain(a.company.id);
        expect(dump).not.toContain(a.user.email);
    });

    it('depois da exclusão o refresh e o access token antigos respondem 401', async () => {
        const a: Account = await signUp('revoked');

        expect((await request('DELETE', '/account', a.tokens.accessToken, { confirmEmail: a.user.email })).status).toBe(204);

        const refresh: Response = await fetch(`${origin}/auth/refresh`, {
            method: 'POST',
            headers: { cookie: `${COOKIE_NAME}=${a.otherTokens.refreshToken}` }
        });
        expect(refresh.status).toBe(401);
        expect(((await refresh.json()) as ProblemBody).type).toBe('identity.invalid_refresh');
        const me: Response = await request('GET', '/auth/me', a.otherTokens.accessToken);
        expect(me.status).toBe(401);
    });

    it('e-mail digitado errado responde 422 e não apaga nada; sem token ou com corpo inválido não chega ao serviço', async () => {
        const a: Account = await signUp('mismatch');
        const before: Record<string, number> = await countsOf(a.company.id);

        const wrong: Response = await request('DELETE', '/account', a.tokens.accessToken, { confirmEmail: 'outra@example.test' });
        const anonymous: Response = await request('DELETE', '/account', null, { confirmEmail: a.user.email });
        const invalid: Response = await request('DELETE', '/account', a.tokens.accessToken, { confirmEmail: 'não-é-email' });

        expect(wrong.status).toBe(422);
        expect(((await wrong.json()) as ProblemBody).type).toBe('identity.confirmation_mismatch');
        expect(anonymous.status).toBe(401);
        expect(invalid.status).toBe(400);
        expect(await countsOf(a.company.id)).toEqual(before);
        expect(publisher.published).toHaveLength(0);
    });

    it('o owner de outra company não alcança a company A, mesmo digitando o e-mail de A', async () => {
        const a: Account = await signUp('target');
        const intruder: Account = await signUp('intruder');
        const beforeA: Record<string, number> = await countsOf(a.company.id);

        const response: Response = await request('DELETE', '/account', intruder.tokens.accessToken, { confirmEmail: a.user.email });

        expect(response.status).toBe(422);
        expect(await countsOf(a.company.id)).toEqual(beforeA);
        expect((await countsOf(intruder.company.id))['Companies']).toBe(1);
    });

    it('apagador que falha dá 500 erasure_failed com a área e não apaga o banco; corrigido, a segunda tentativa conclui', async () => {
        const a: Account = await signUp('retry');
        const before: Record<string, number> = await countsOf(a.company.id);
        flakyEraser.failing = true;

        const failed: Response = await request('DELETE', '/account', a.tokens.accessToken, { confirmEmail: a.user.email });
        const problem: ProblemBody = (await failed.json()) as ProblemBody;

        expect(failed.status).toBe(500);
        expect(problem.type).toBe('identity.erasure_failed');
        expect(problem.meta).toEqual({ area: 'flaky' });
        expect(await countsOf(a.company.id)).toEqual(before);
        expect(await deletionLog.findByCompanyId(a.company.id)).toHaveLength(0);
        expect(publisher.published).toHaveLength(0);

        flakyEraser.failing = false;
        const retried: Response = await request('DELETE', '/account', a.tokens.accessToken, { confirmEmail: a.user.email });

        expect(retried.status).toBe(204);
        expect((await countsOf(a.company.id))['Companies']).toBe(0);
    });

    it('limita as tentativas de exclusão por usuário', async () => {
        const a: Account = await signUp('throttled-delete');
        const statuses: number[] = [];

        for (let attempt = 0; attempt < 6; attempt += 1) {
            statuses.push((await request('DELETE', '/account', a.tokens.accessToken, { confirmEmail: 'outra@example.test' })).status);
        }

        expect(statuses).toEqual([422, 422, 422, 422, 422, 429]);
        expect((await countsOf(a.company.id))['Companies']).toBe(1);
    });

    it('enfileira o e-mail account-deleted uma única vez, com jobId determinístico, e o template existe em pt-BR e en', async () => {
        const a: Account = await signUp('mail');

        await request('DELETE', '/account', a.tokens.accessToken, { confirmEmail: a.user.email });

        expect(publisher.published).toHaveLength(1);
        const message = publisher.published[0];
        expect(message?.options).toEqual({ jobId: `email-account-deleted-${deletionLog.hashOf(a.company.id)}` });
        expect(message?.payload).toMatchObject({
            template: 'account-deleted',
            locale: 'en',
            to: { email: a.user.email },
            props: { firstName: 'Pessoa' }
        });
        expect(JSON.stringify(message?.payload)).not.toContain(a.company.id);
        expect(templates.render('account-deleted', 'pt-BR', { firstName: 'Ana' }).subject).toBe('Sua conta na Vera foi excluída');
        expect(templates.render('account-deleted', 'en', { firstName: 'Ana' }).subject).toBe('Your Vera account was deleted');
    });

    it('exporta só a company de quem pede, sem segredos, como anexo JSON, e a quarta chamada na hora dá 429', async () => {
        const a: Account = await signUp('export-a');
        const b: Account = await signUp('export-b');

        const response: Response = await request('GET', '/account/export', a.tokens.accessToken);
        const text: string = await response.text();
        const body: ExportBody = JSON.parse(text) as ExportBody;

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('application/json');
        expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="vera-export-\d{4}-\d{2}-\d{2}\.json"$/);
        expect(body.format).toBe('vera-export/1');
        expect(body.exportedAt.slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
        expect(body.account.user.email).toBe(a.user.email);
        expect(body.account.company.name).toBe('Empresa export-a');
        expect(body.account.identities).toEqual([{ provider: 'google', createdAt: expect.any(String), lastLoginAt: expect.any(String) }]);
        expect(body.account.sessions).toHaveLength(2);
        expect(body.sections).toEqual({ notes: { owner: a.company.id, items: ['item-of-this-company'] } });
        expect(text).not.toContain('tokenHash');
        expect(text).not.toContain('subject');
        expect(text).not.toContain(b.user.email);
        expect(text).not.toContain(b.company.id);
        expect(text).not.toContain(a.tokens.refreshToken);

        expect((await request('GET', '/account/export', a.tokens.accessToken)).status).toBe(200);
        expect((await request('GET', '/account/export', a.tokens.accessToken)).status).toBe(200);
        const limited: Response = await request('GET', '/account/export', a.tokens.accessToken);
        expect(limited.status).toBe(429);
        expect(((await limited.json()) as ProblemBody).type).toBe('core.too_many_attempts');
        expect((await request('GET', '/account/export', b.tokens.accessToken)).status).toBe(200);
        expect((await request('GET', '/account/export', null)).status).toBe(401);
    });

    it('exportador que falha derruba a resposta inteira com 500 export_failed e a área, sem arquivo parcial', async () => {
        const a: Account = await signUp('export-fail');
        exporter.failing = true;

        const response: Response = await request('GET', '/account/export', a.tokens.accessToken);
        const problem: ProblemBody = (await response.json()) as ProblemBody;

        expect(response.status).toBe(500);
        expect(problem.type).toBe('identity.export_failed');
        expect(problem.meta).toEqual({ area: 'notes' });
        expect(response.headers.get('content-disposition')).toBeNull();
    });
});
