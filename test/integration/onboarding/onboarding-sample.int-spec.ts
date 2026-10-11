import { AddressInfo, Server } from 'node:net';
import { INestApplication, Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { sql } from 'kysely';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { AppModule } from '../../../src/app.module';
import { AppContext } from '../../../src/core/context/app-context.port';
import { TransactionalContext } from '../../../src/core/database/using-transaction.decorator';
import { CompanyDomain } from '../../../src/modules/identity/domain/company.domain';
import { Company, User } from '../../../src/modules/identity/domain/identity.types';
import { UserDomain } from '../../../src/modules/identity/domain/user.domain';
import { SessionIssuerPort } from '../../../src/modules/identity/ports/session-issuer.port';
import { SampleDataPort } from '../../../src/modules/onboarding/services/sample-data.port';
import { createIsolatedDatabase, IsolatedDatabase } from '../support/isolated-database';
import { withoutBusinessPorts } from '../support/inert-ports';
import { isolateRedisForWorker } from '../support/queue';

interface Account {
    readonly company: Company;
    readonly token: string;
}

interface StateBody {
    readonly status: string;
    readonly dismissedAt: string | null;
    readonly sample: { readonly active: boolean; readonly available: boolean };
}

interface ProblemBody {
    readonly type: string;
    readonly meta?: { readonly area?: string };
}

const behavior: { failSpending: boolean } = { failSpending: false };

abstract class ProbePort extends SampleDataPort {
    public async seed(companyId: string): Promise<number> {
        const executor = TransactionalContext.get().executor;
        const real = await sql<{ total: string }>`
            SELECT count(*) AS total FROM "SampleProbe" WHERE "companyId" = ${companyId} AND "area" = ${this.area} AND "isSample" = false
        `.execute(executor);
        if (Number(real.rows[0]?.total) > 0) {
            return 0;
        }
        const inserted = await sql`
            INSERT INTO "SampleProbe" ("id", "companyId", "area", "isSample", "label")
            VALUES (gen_random_uuid(), ${companyId}, ${this.area}, true, 'a'), (gen_random_uuid(), ${companyId}, ${this.area}, true, 'b')
            ON CONFLICT ("companyId", "area", "label") WHERE "isSample" DO NOTHING
        `.execute(executor);
        return Number(inserted.numAffectedRows ?? 0);
    }

    public async clear(companyId: string): Promise<number> {
        const deleted = await sql`
            DELETE FROM "SampleProbe" WHERE "companyId" = ${companyId} AND "area" = ${this.area} AND "isSample" = true
        `.execute(TransactionalContext.get().executor);
        return Number(deleted.numAffectedRows ?? 0);
    }
}

@Injectable()
class AssetsProbePort extends ProbePort {
    public readonly area: string = 'assets';
}

@Injectable()
class SpendingProbePort extends ProbePort {
    public readonly area: string = 'spending';

    public override async seed(companyId: string): Promise<number> {
        const seeded: number = await super.seed(companyId);
        if (behavior.failSpending) {
            throw new Error('spending module is down');
        }
        return seeded;
    }
}

describe('onboarding sample data', () => {
    let app: INestApplication;
    let origin: string;
    let isolated: IsolatedDatabase;
    let pg: Client;
    let context: AppContext;
    let companies: CompanyDomain;
    let users: UserDomain;
    let issuer: SessionIssuerPort;

    beforeAll(async () => {
        isolated = await createIsolatedDatabase('onboarding_sample');
        process.env['DATABASE_URL'] = isolated.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';

        pg = new Client({ connectionString: isolated.url });
        await pg.connect();
        await pg.query(`
            CREATE TABLE "SampleProbe" (
                "id" uuid PRIMARY KEY,
                "companyId" uuid NOT NULL REFERENCES "Companies" ("id") ON DELETE CASCADE,
                "area" text NOT NULL,
                "isSample" boolean NOT NULL DEFAULT false,
                "label" text NOT NULL
            )
        `);
        await pg.query(`CREATE UNIQUE INDEX "SampleProbe_sample_unique" ON "SampleProbe" ("companyId", "area", "label") WHERE "isSample"`);

        const testing: TestingModule = await withoutBusinessPorts(
            Test.createTestingModule({
                imports: [AppModule],
                providers: [AssetsProbePort, SpendingProbePort]
            })
        ).compile();
        app = testing.createNestApplication();
        app.use(cookieParser());
        await app.init();
        await app.listen(0);
        const address: AddressInfo = (app.getHttpServer() as Server).address() as AddressInfo;
        origin = `http://127.0.0.1:${String(address.port)}`;

        context = app.get(AppContext);
        companies = app.get(CompanyDomain, { strict: false });
        users = app.get(UserDomain, { strict: false });
        issuer = app.get(SessionIssuerPort, { strict: false });
    });

    afterAll(async () => {
        await pg.end();
        await app.close();
        await isolated.drop();
    });

    const inCompany = async <T>(companyId: string, fn: () => Promise<T>): Promise<T> =>
        context.run({ requestId: 'test', companyId, locale: 'pt-BR' }, fn);

    async function signUp(label: string): Promise<Account> {
        const company: Company = await companies.create({ name: `Empresa ${label}`, locale: 'pt-BR' });
        const user: User = await inCompany(company.id, async () =>
            users.createOwner({
                email: `${label}-${crypto.randomUUID()}@example.com`,
                name: `Pessoa ${label}`,
                emailVerifiedAt: new Date(),
                termsAcceptedAt: new Date()
            })
        );
        const tokens = await inCompany(company.id, async () =>
            issuer.issueForNewLogin(user, { ip: '203.0.113.7', userAgent: 'int-test' }, 'google')
        );
        return { company, token: tokens.accessToken };
    }

    async function call(token: string | null, method: 'GET' | 'POST' | 'DELETE', path: string): Promise<Response> {
        const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
        return fetch(`${origin}/onboarding${path}`, { method, headers });
    }

    async function state(token: string, method: 'GET' | 'POST' | 'DELETE', path: string): Promise<StateBody> {
        const response: Response = await call(token, method, path);
        expect(response.status).toBe(200);
        return (await response.json()) as StateBody;
    }

    async function probeRows(companyId: string, area: string, isSample: boolean): Promise<number> {
        const result = await pg.query<{ total: string }>(
            'SELECT count(*) AS total FROM "SampleProbe" WHERE "companyId" = $1 AND "area" = $2 AND "isSample" = $3',
            [companyId, area, isSample]
        );
        return Number(result.rows[0]?.total);
    }

    async function sampleLoadedAt(companyId: string): Promise<Date | null> {
        const result = await pg.query<{ sampleLoadedAt: Date | null }>(
            'SELECT "sampleLoadedAt" FROM "OnboardingStates" WHERE "companyId" = $1',
            [companyId]
        );
        return result.rows[0]?.sampleLoadedAt ?? null;
    }

    it('GET informa sample.available true quando há porta registrada', async () => {
        const account: Account = await signUp('available');

        const body: StateBody = await state(account.token, 'GET', '');

        expect(body.sample).toEqual({ active: false, available: true });
    });

    it('carrega as duas áreas marcadas, ativa o exemplo, fecha o onboarding aberto e repetir não duplica', async () => {
        const account: Account = await signUp('load');

        const loaded: StateBody = await state(account.token, 'POST', '/sample');

        expect(loaded.sample).toEqual({ active: true, available: true });
        expect(loaded.status).toBe('closed');
        expect(loaded.dismissedAt).not.toBeNull();
        expect(await probeRows(account.company.id, 'assets', true)).toBe(2);
        expect(await probeRows(account.company.id, 'spending', true)).toBe(2);
        const stamp: Date | null = await sampleLoadedAt(account.company.id);
        expect(stamp).not.toBeNull();

        const again: StateBody = await state(account.token, 'POST', '/sample');

        expect(again.sample.active).toBe(true);
        expect(await probeRows(account.company.id, 'assets', true)).toBe(2);
        expect(await probeRows(account.company.id, 'spending', true)).toBe(2);
        expect(await sampleLoadedAt(account.company.id)).toEqual(stamp);
    });

    it('onboarding já fechado fica intacto ao carregar o exemplo', async () => {
        const account: Account = await signUp('closed');
        const finished: StateBody = await state(account.token, 'POST', '/finish');

        const loaded: StateBody = await state(account.token, 'POST', '/sample');

        expect(finished.dismissedAt).toBeNull();
        expect(loaded.dismissedAt).toBeNull();
        expect(loaded.status).toBe('closed');
        expect(loaded.sample.active).toBe(true);
    });

    it('área com dado real não recebe exemplo e a outra recebe', async () => {
        const account: Account = await signUp('real-data');
        await state(account.token, 'GET', '');
        await pg.query(
            `INSERT INTO "SampleProbe" ("id", "companyId", "area", "isSample", "label") VALUES (gen_random_uuid(), $1, 'assets', false, 'real')`,
            [account.company.id]
        );

        const loaded: StateBody = await state(account.token, 'POST', '/sample');

        expect(loaded.sample.active).toBe(true);
        expect(await probeRows(account.company.id, 'assets', true)).toBe(0);
        expect(await probeRows(account.company.id, 'assets', false)).toBe(1);
        expect(await probeRows(account.company.id, 'spending', true)).toBe(2);
    });

    it('com dado real em todas as áreas nada é semeado e o estado fica como estava', async () => {
        const account: Account = await signUp('all-real');
        await state(account.token, 'GET', '');
        for (const area of ['assets', 'spending']) {
            await pg.query(
                `INSERT INTO "SampleProbe" ("id", "companyId", "area", "isSample", "label") VALUES (gen_random_uuid(), $1, $2, false, 'real')`,
                [account.company.id, area]
            );
        }

        const loaded: StateBody = await state(account.token, 'POST', '/sample');

        expect(loaded.sample.active).toBe(false);
        expect(loaded.status).toBe('welcome');
        expect(await sampleLoadedAt(account.company.id)).toBeNull();
    });

    it('porta que lança na segunda área responde 500 e desfaz também a primeira', async () => {
        const account: Account = await signUp('rollback');
        await state(account.token, 'GET', '');
        behavior.failSpending = true;

        const response: Response = await call(account.token, 'POST', '/sample');
        behavior.failSpending = false;

        const problem = (await response.json()) as ProblemBody;
        expect(response.status).toBe(500);
        expect(problem.type).toBe('onboarding.sample_failed');
        expect(problem.meta?.area).toBe('spending');
        expect(await probeRows(account.company.id, 'assets', true)).toBe(0);
        expect(await probeRows(account.company.id, 'spending', true)).toBe(0);
        expect(await sampleLoadedAt(account.company.id)).toBeNull();
        const after: StateBody = await state(account.token, 'GET', '');
        expect(after.status).toBe('welcome');
        expect(after.sample.active).toBe(false);
    });

    it('DELETE remove só as marcadas, preserva a linha real, zera o exemplo e repetir não tem efeito', async () => {
        const account: Account = await signUp('clear');
        await state(account.token, 'GET', '');
        await pg.query(
            `INSERT INTO "SampleProbe" ("id", "companyId", "area", "isSample", "label") VALUES (gen_random_uuid(), $1, 'assets', false, 'real')`,
            [account.company.id]
        );
        await state(account.token, 'POST', '/sample');

        const cleared: StateBody = await state(account.token, 'DELETE', '/sample');

        expect(cleared.sample).toEqual({ active: false, available: true });
        expect(cleared.status).toBe('closed');
        expect(await probeRows(account.company.id, 'assets', false)).toBe(1);
        expect(await probeRows(account.company.id, 'assets', true)).toBe(0);
        expect(await probeRows(account.company.id, 'spending', true)).toBe(0);
        expect(await sampleLoadedAt(account.company.id)).toBeNull();
        expect((await state(account.token, 'DELETE', '/sample')).sample.active).toBe(false);
    });

    it('limpar sem exemplo ativo responde 200 sem efeito e sem abrir o onboarding', async () => {
        const account: Account = await signUp('clear-empty');

        const cleared: StateBody = await state(account.token, 'DELETE', '/sample');

        expect(cleared.sample.active).toBe(false);
        expect(cleared.status).toBe('welcome');
    });

    it('duas companies: carregar na A não cria nada na B e limpar na B não remove o da A', async () => {
        const a: Account = await signUp('tenant-a');
        const b: Account = await signUp('tenant-b');
        await state(b.token, 'GET', '');

        await state(a.token, 'POST', '/sample');

        expect(await probeRows(b.company.id, 'assets', true)).toBe(0);
        expect((await state(b.token, 'GET', '')).sample.active).toBe(false);

        await state(b.token, 'DELETE', '/sample');

        expect(await probeRows(a.company.id, 'assets', true)).toBe(2);
        expect(await probeRows(a.company.id, 'spending', true)).toBe(2);
        expect((await state(a.token, 'GET', '')).sample.active).toBe(true);
    });

    it('sem token as duas rotas respondem 401', async () => {
        for (const method of ['POST', 'DELETE'] as const) {
            const response: Response = await call(null, method, '/sample');
            const problem = (await response.json()) as ProblemBody;
            expect(response.status).toBe(401);
            expect(problem.type).toBe('identity.unauthorized');
        }
    });

    it('a 11ª carga na mesma hora responde 429', async () => {
        const account: Account = await signUp('throttle');

        for (let attempt = 0; attempt < 10; attempt += 1) {
            expect((await call(account.token, 'POST', '/sample')).status).toBe(200);
        }
        const blocked: Response = await call(account.token, 'POST', '/sample');

        const problem = (await blocked.json()) as ProblemBody;
        expect(blocked.status).toBe(429);
        expect(problem.type).toBe('core.too_many_attempts');
    });
});
