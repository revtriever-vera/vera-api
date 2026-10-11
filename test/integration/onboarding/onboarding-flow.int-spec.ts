import { AddressInfo, Server } from 'node:net';
import { INestApplication, Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { AppModule } from '../../../src/app.module';
import { AppContext } from '../../../src/core/context/app-context.port';
import { CompanyDomain } from '../../../src/modules/identity/domain/company.domain';
import { Company, User } from '../../../src/modules/identity/domain/identity.types';
import { UserDomain } from '../../../src/modules/identity/domain/user.domain';
import { SessionIssuerPort } from '../../../src/modules/identity/ports/session-issuer.port';
import {
    OnboardingArea,
    OnboardingAreaSummary,
    OnboardingAreaSummaryPort
} from '../../../src/modules/onboarding/services/onboarding-area-summary.port';
import { createIsolatedDatabase, IsolatedDatabase } from '../support/isolated-database';
import { withoutBusinessPorts } from '../support/inert-ports';
import { isolateRedisForWorker } from '../support/queue';

interface Account {
    readonly company: Company;
    readonly token: string;
}

interface StateBody {
    readonly status: string;
    readonly startedAt: string | null;
    readonly steps: {
        readonly assets: { readonly doneAt: string | null; readonly skippedAt: string | null };
        readonly banks: { readonly doneAt: string | null; readonly skippedAt: string | null };
    };
    readonly completedAt: string | null;
    readonly dismissedAt: string | null;
    readonly sample: { readonly active: boolean; readonly available: boolean };
}

interface ProblemBody {
    readonly type: string;
    readonly status: number;
}

const portBehavior: { failBanks: boolean } = { failBanks: false };

@Injectable()
class AssetsTestPort extends OnboardingAreaSummaryPort {
    public readonly area: OnboardingArea = 'assets';

    public summarize(companyId: string): Promise<OnboardingAreaSummary> {
        return Promise.resolve({ items: companyId.length, amountCents: 8_400_000, currency: 'BRL' });
    }
}

@Injectable()
class BanksTestPort extends OnboardingAreaSummaryPort {
    public readonly area: OnboardingArea = 'banks';

    public summarize(): Promise<OnboardingAreaSummary> {
        if (portBehavior.failBanks) {
            return Promise.reject(new Error('banks module is down'));
        }
        return Promise.resolve({ items: 2, amountCents: null, currency: null, breakdown: { connections: 2, imports: 1 } });
    }
}

describe('onboarding flow', () => {
    let app: INestApplication;
    let origin: string;
    let isolated: IsolatedDatabase;
    let pg: Client;
    let context: AppContext;
    let companies: CompanyDomain;
    let users: UserDomain;
    let issuer: SessionIssuerPort;

    beforeAll(async () => {
        isolated = await createIsolatedDatabase('onboarding');
        process.env['DATABASE_URL'] = isolated.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';

        const testing: TestingModule = await withoutBusinessPorts(
            Test.createTestingModule({
                imports: [AppModule],
                providers: [AssetsTestPort, BanksTestPort]
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

    async function call(token: string | null, method: 'GET' | 'POST', path: string): Promise<Response> {
        const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
        return fetch(`${origin}/onboarding${path}`, { method, headers });
    }

    async function state(token: string, method: 'GET' | 'POST', path: string): Promise<StateBody> {
        const response: Response = await call(token, method, path);
        expect(response.status).toBe(200);
        return (await response.json()) as StateBody;
    }

    async function rowsOf(companyId: string): Promise<number> {
        const result = await pg.query<{ total: string }>('SELECT count(*) AS total FROM "OnboardingStates" WHERE "companyId" = $1', [
            companyId
        ]);
        return Number(result.rows[0]?.total);
    }

    it('a primeira GET cria a linha em welcome e duas chamadas simultâneas resultam em uma linha só', async () => {
        const account: Account = await signUp('first');
        expect(await rowsOf(account.company.id)).toBe(0);

        const responses: Response[] = await Promise.all([
            call(account.token, 'GET', ''),
            call(account.token, 'GET', ''),
            call(account.token, 'GET', '')
        ]);

        expect(responses.map((response: Response) => response.status)).toEqual([200, 200, 200]);
        const body = (await responses[0]?.json()) as StateBody;
        expect(body).toEqual({
            status: 'welcome',
            startedAt: null,
            steps: { assets: { doneAt: null, skippedAt: null }, banks: { doneAt: null, skippedAt: null } },
            completedAt: null,
            dismissedAt: null,
            sample: { active: false, available: false }
        });
        expect(await rowsOf(account.company.id)).toBe(1);
    });

    it('start, assets/complete, banks/skip e finish passam por assets, banks, summary e closed', async () => {
        const account: Account = await signUp('sequence');

        expect((await state(account.token, 'POST', '/start')).status).toBe('assets');
        const afterAssets: StateBody = await state(account.token, 'POST', '/steps/assets/complete');
        expect(afterAssets.status).toBe('banks');
        expect(afterAssets.steps.assets.doneAt).not.toBeNull();
        const afterBanks: StateBody = await state(account.token, 'POST', '/steps/banks/skip');
        expect(afterBanks.status).toBe('summary');
        expect(afterBanks.steps.banks.skippedAt).not.toBeNull();
        expect(afterBanks.steps.banks.doneAt).toBeNull();
        const finished: StateBody = await state(account.token, 'POST', '/finish');
        expect(finished.status).toBe('closed');
        expect(finished.completedAt).not.toBeNull();
        expect((await state(account.token, 'GET', '')).status).toBe('closed');
    });

    it('fora de ordem funciona e o status volta ao primeiro passo em aberto', async () => {
        const account: Account = await signUp('order');
        await state(account.token, 'POST', '/start');

        const banksFirst: StateBody = await state(account.token, 'POST', '/steps/banks/complete');

        expect(banksFirst.status).toBe('assets');
        expect(banksFirst.steps.banks.doneAt).not.toBeNull();
        expect((await state(account.token, 'POST', '/steps/assets/skip')).status).toBe('summary');
    });

    it('pular e depois concluir a mesma etapa deixa só doneAt, e repetir a chamada não muda nada', async () => {
        const account: Account = await signUp('flip');
        await state(account.token, 'POST', '/steps/assets/skip');

        const done: StateBody = await state(account.token, 'POST', '/steps/assets/complete');
        const again: StateBody = await state(account.token, 'POST', '/steps/assets/complete');

        expect(done.steps.assets.skippedAt).toBeNull();
        expect(done.steps.assets.doneAt).not.toBeNull();
        expect(again.steps.assets).toEqual(done.steps.assets);
        const skippedAgain: StateBody = await state(account.token, 'POST', '/steps/banks/skip');
        expect((await state(account.token, 'POST', '/steps/banks/skip')).steps.banks).toEqual(skippedAgain.steps.banks);
    });

    it('start é idempotente e mantém o primeiro carimbo', async () => {
        const account: Account = await signUp('start');

        const first: StateBody = await state(account.token, 'POST', '/start');
        const second: StateBody = await state(account.token, 'POST', '/start');

        expect(second.startedAt).toBe(first.startedAt);
    });

    it('dismiss fecha em qualquer ponto e depois start, complete e skip respondem 409', async () => {
        const account: Account = await signUp('dismiss');

        const dismissed: StateBody = await state(account.token, 'POST', '/dismiss');

        expect(dismissed.status).toBe('closed');
        expect(dismissed.dismissedAt).not.toBeNull();
        expect(dismissed.steps.assets.skippedAt).toBeNull();
        for (const path of ['/start', '/steps/assets/complete', '/steps/banks/skip']) {
            const response: Response = await call(account.token, 'POST', path);
            const problem = (await response.json()) as ProblemBody;
            expect(response.status).toBe(409);
            expect(problem.type).toBe('onboarding.already_closed');
        }
        expect((await call(account.token, 'POST', '/finish')).status).toBe(409);
        expect((await call(account.token, 'POST', '/dismiss')).status).toBe(200);
    });

    it('passo desconhecido responde 400 onboarding.unknown_step', async () => {
        const account: Account = await signUp('unknown');

        const response: Response = await call(account.token, 'POST', '/steps/target/complete');
        const problem = (await response.json()) as ProblemBody;

        expect(response.status).toBe(400);
        expect(problem.type).toBe('onboarding.unknown_step');
    });

    it('o resumo devolve as áreas com porta registrada e null nas demais', async () => {
        const account: Account = await signUp('summary');
        portBehavior.failBanks = false;

        const response: Response = await call(account.token, 'GET', '/summary');

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            assets: { items: account.company.id.length, amountCents: 8_400_000, currency: 'BRL' },
            banks: { items: 2, amountCents: null, currency: null, breakdown: { connections: 2, imports: 1 } },
            target: null
        });
    });

    it('porta que lança vira null naquela área e a resposta continua 200', async () => {
        const account: Account = await signUp('summary-failure');
        portBehavior.failBanks = true;

        const response: Response = await call(account.token, 'GET', '/summary');
        portBehavior.failBanks = false;

        expect(response.status).toBe(200);
        const body = (await response.json()) as Record<string, unknown>;
        expect(body['banks']).toBeNull();
        expect(body['target']).toBeNull();
        expect(body['assets']).not.toBeNull();
    });

    it('duas companies: concluir a etapa de uma não altera a linha da outra', async () => {
        const a: Account = await signUp('tenant-a');
        const b: Account = await signUp('tenant-b');
        await state(a.token, 'GET', '');
        await state(b.token, 'GET', '');

        await state(a.token, 'POST', '/start');
        await state(a.token, 'POST', '/steps/assets/complete');

        const seenByB: StateBody = await state(b.token, 'GET', '');
        expect(seenByB.status).toBe('welcome');
        expect(seenByB.steps.assets.doneAt).toBeNull();
        const seenByA: StateBody = await state(a.token, 'GET', '');
        expect(seenByA.steps.assets.doneAt).not.toBeNull();
        expect(await rowsOf(a.company.id)).toBe(1);
        expect(await rowsOf(b.company.id)).toBe(1);
    });

    it('sem token todas as rotas respondem 401', async () => {
        const routes: ReadonlyArray<readonly ['GET' | 'POST', string]> = [
            ['GET', ''],
            ['GET', '/summary'],
            ['POST', '/start'],
            ['POST', '/steps/assets/complete'],
            ['POST', '/steps/banks/skip'],
            ['POST', '/finish'],
            ['POST', '/dismiss']
        ];
        for (const [method, path] of routes) {
            const response: Response = await call(null, method, path);
            const problem = (await response.json()) as ProblemBody;
            expect(response.status).toBe(401);
            expect(problem.type).toBe('identity.unauthorized');
        }
    });

    it('as check constraints recusam feito e pulado juntos e os dois desfechos juntos', async () => {
        const account: Account = await signUp('constraints');
        await state(account.token, 'GET', '');

        const statements: readonly string[] = [
            'UPDATE "OnboardingStates" SET "assetsDoneAt" = now(), "assetsSkippedAt" = now() WHERE "companyId" = $1',
            'UPDATE "OnboardingStates" SET "banksDoneAt" = now(), "banksSkippedAt" = now() WHERE "companyId" = $1',
            'UPDATE "OnboardingStates" SET "completedAt" = now(), "dismissedAt" = now() WHERE "companyId" = $1'
        ];
        for (const statement of statements) {
            await expect(pg.query(statement, [account.company.id])).rejects.toThrow(/OnboardingStates_/);
        }
    });
});
