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
    readonly user: { id: string; companyId?: string };
}

interface ProblemBody {
    readonly type: string;
}

interface AccessBody {
    readonly accountId: string;
    readonly summary?: { people: readonly { email: string }[]; account: { plan: string } };
    readonly data?: Record<string, unknown>;
}

interface SupportAccessBody {
    readonly items: readonly { operatorName: string | null; reason: string; layers: readonly string[] }[];
}

const GOOGLE: FakeGoogle = new FakeGoogle();

describe('contas e acesso com motivo (hospedada)', () => {
    let app: INestApplication;
    let origin: string;
    let isolated: IsolatedDatabase;
    let pg: Client;
    let adminToken: string;
    let customerToken: string;
    let customerCompanyId: string;
    const adminEmail: string = `admin-${crypto.randomUUID()}@example.test`;
    const customerEmail: string = `cliente-${crypto.randomUUID()}@example.test`;

    function request(method: string, path: string, body?: unknown, token?: string): Promise<Response> {
        return fetch(`${origin}${path}`, {
            method,
            headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
    }

    async function viewedCount(): Promise<number> {
        const rows = await pg.query<{ total: string }>(`SELECT count(*) AS total FROM "PlatformAuditLog" WHERE action = 'account.viewed'`);
        return Number(rows.rows[0]?.total);
    }

    beforeAll(async () => {
        isolated = await createIsolatedDatabase('platform_accounts');
        process.env['DATABASE_URL'] = isolated.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';
        process.env['DEPLOYMENT_MODE'] = 'hosted';
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
        const customer = (await (
            await request('POST', '/auth/google', {
                idToken: GOOGLE.register({ subject: 'g-cliente', email: customerEmail, name: 'Cora Cliente' })
            })
        ).json()) as LoginBody;
        customerToken = customer.accessToken;
        customerCompanyId = (await pg.query<{ companyId: string }>(`SELECT "companyId" FROM "Users" WHERE email = $1`, [customerEmail]))
            .rows[0]?.companyId as string;
    });

    afterAll(async () => {
        await pg.end();
        await app.close();
        await isolated.drop();
    });

    beforeEach(async () => {
        await pg.query('DELETE FROM "Throttles"');
    });

    it('lista as contas só com metadados, sem a company de sistema, e mostra os números', async () => {
        const list = (await (await request('GET', '/platform/accounts', undefined, adminToken)).json()) as {
            items: { id: string; plan: string }[];
            total: number;
        };
        const overview = (await (await request('GET', '/platform/overview', undefined, adminToken)).json()) as {
            accounts: { total: number };
            plans: { free: number };
        };

        expect(list.items.map((item) => item.id)).toEqual([customerCompanyId]);
        expect(list.items[0]?.plan).toBe('free');
        expect(overview.accounts.total).toBe(1);
        expect(overview.plans.free).toBe(1);
    });

    it('abre resumo e dados com motivo, grava account.viewed e o Dono vê o acesso, sem chaves nem conversas', async () => {
        const before: number = await viewedCount();

        const response: Response = await request(
            'POST',
            `/platform/accounts/${customerCompanyId}/access`,
            { reason: 'Cliente pediu ajuda com a carteira', layers: ['summary', 'data'] },
            adminToken
        );
        const body = (await response.json()) as AccessBody;

        expect(response.status).toBe(200);
        expect(body.summary?.people.map((person) => person.email)).toEqual([customerEmail]);
        expect(body.summary?.account.plan).toBe('free');
        const dataKeys: string[] = Object.keys(body.data ?? {});
        expect(dataKeys).toContain('goals');
        expect(dataKeys).not.toContain('whatsapp');
        expect(dataKeys).not.toContain('ai_summaries');
        expect(JSON.stringify(body)).not.toMatch(/clientIdHint|itemIdHint|cardLast4/);
        expect(await viewedCount()).toBe(before + 1);
        const seen = (await (await request('GET', '/account/support-access', undefined, customerToken)).json()) as SupportAccessBody;
        expect(seen.items[0]).toEqual(
            expect.objectContaining({
                operatorName: expect.any(String) as string,
                reason: 'Cliente pediu ajuda com a carteira',
                layers: ['summary', 'data']
            })
        );
    });

    it('sem motivo, com motivo curto ou sem camadas responde 400 e não audita', async () => {
        const before: number = await viewedCount();
        const path: string = `/platform/accounts/${customerCompanyId}/access`;

        const noReason: Response = await request('POST', path, { layers: ['summary'] }, adminToken);
        const shortReason: Response = await request('POST', path, { reason: 'oi', layers: ['summary'] }, adminToken);
        const noLayers: Response = await request('POST', path, { reason: 'Verificar cobrança', layers: [] }, adminToken);

        expect([noReason.status, shortReason.status, noLayers.status]).toEqual([400, 400, 400]);
        expect(await viewedCount()).toBe(before);
    });

    it('conta inexistente, a de sistema ou id inválido não abrem nada nem auditam', async () => {
        const before: number = await viewedCount();
        const platformId: string = (await pg.query<{ id: string }>(`SELECT id FROM "Companies" WHERE "isPlatform" = true`)).rows[0]
            ?.id as string;
        const input: unknown = { reason: 'Verificar cobrança', layers: ['data'] };

        const unknown: Response = await request('POST', `/platform/accounts/${crypto.randomUUID()}/access`, input, adminToken);
        const platform: Response = await request('POST', `/platform/accounts/${platformId}/access`, input, adminToken);

        expect(unknown.status).toBe(404);
        expect(((await unknown.json()) as ProblemBody).type).toBe('platform.account_not_found');
        expect(platform.status).toBe(404);
        expect(await viewedCount()).toBe(before);
    });

    it('quem não é da company de sistema leva 403 nas rotas do admin', async () => {
        const list: Response = await request('GET', '/platform/accounts', undefined, customerToken);
        const open: Response = await request(
            'POST',
            `/platform/accounts/${customerCompanyId}/access`,
            { reason: 'Verificar cobrança', layers: ['summary'] },
            customerToken
        );

        expect(list.status).toBe(403);
        expect(open.status).toBe(403);
    });

    it('uma conta não vê os acessos de outra', async () => {
        const other = (await (
            await request('POST', '/auth/google', {
                idToken: GOOGLE.register({ subject: 'g-outro', email: `outro-${crypto.randomUUID()}@example.test`, name: 'Outro' })
            })
        ).json()) as LoginBody;

        const seen = (await (await request('GET', '/account/support-access', undefined, other.accessToken)).json()) as SupportAccessBody;

        expect(seen.items).toEqual([]);
    });
});
