import { createHash } from 'node:crypto';
import { AddressInfo, Server } from 'node:net';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
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
}

interface CreatedToken {
    readonly id: string;
    readonly token: string;
    readonly hint: string;
    readonly expiresAt: string;
}

interface AuditRow {
    readonly action: string;
    readonly meta: Record<string, unknown>;
}

const GOOGLE: FakeGoogle = new FakeGoogle();
const DAY_MS: number = 86_400_000;

describe('servidor MCP da plataforma (hospedada)', () => {
    let app: INestApplication;
    let origin: string;
    let isolated: IsolatedDatabase;
    let pg: Client;
    let adminSession: string;
    let customerSession: string;
    let customerCompanyId: string;
    let customerUserId: string;
    let platformToken: CreatedToken;
    const adminEmail: string = `admin-${crypto.randomUUID()}@example.test`;
    const customerEmail: string = `cliente-${crypto.randomUUID()}@example.test`;

    function request(method: string, path: string, body?: unknown, bearer?: string): Promise<Response> {
        return fetch(`${origin}${path}`, {
            method,
            headers: {
                'content-type': 'application/json',
                accept: 'application/json, text/event-stream',
                ...(bearer ? { authorization: `Bearer ${bearer}` } : {})
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
    }

    async function createToken(body: unknown = { name: 'notebook' }): Promise<CreatedToken> {
        const response: Response = await request('POST', '/platform/tokens', body, adminSession);
        expect(response.status).toBe(201);
        return (await response.json()) as CreatedToken;
    }

    async function connect(secret: string): Promise<McpClient> {
        const client: McpClient = new McpClient({ name: 'int-spec', version: '1' });
        await client.connect(
            new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), { requestInit: { headers: { authorization: `Bearer ${secret}` } } })
        );
        return client;
    }

    async function call(client: McpClient, name: string, args: Record<string, unknown> = {}): Promise<{ isError: boolean; text: string }> {
        const result = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
        return { isError: result.isError === true, text: result.content[0]?.text ?? '' };
    }

    async function auditOf(action: string): Promise<AuditRow[]> {
        const rows = await pg.query<AuditRow>(`SELECT action, meta FROM "PlatformAuditLog" WHERE action = $1 ORDER BY "createdAt"`, [
            action
        ]);
        return rows.rows;
    }

    async function login(subject: string, email: string, audience?: string): Promise<{ session: string; setup?: string }> {
        const first = (await (
            await request('POST', '/auth/google', {
                idToken: GOOGLE.register({ subject, email, name: subject }),
                ...(audience ? { audience } : {})
            })
        ).json()) as LoginBody & { setupToken?: string };
        return { session: first.accessToken, setup: first.setupToken };
    }

    beforeAll(async () => {
        isolated = await createIsolatedDatabase('platform_mcp');
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
        const step = await login('g-admin', adminEmail, 'admin');
        const enrolled = (await (await request('POST', '/auth/totp/enroll', { setupToken: step.setup })).json()) as { secret: string };
        const activated = (await (
            await request('POST', '/auth/totp/activate', { setupToken: step.setup, code: authenticator.generate(enrolled.secret) })
        ).json()) as LoginBody;
        adminSession = activated.accessToken;
        customerSession = (await login('g-cliente', customerEmail)).session;
        const customer = (
            await pg.query<{ id: string; companyId: string }>(`SELECT id, "companyId" FROM "Users" WHERE email = $1`, [customerEmail])
        ).rows[0];
        customerCompanyId = customer?.companyId as string;
        customerUserId = customer?.id as string;
        platformToken = await createToken({ name: 'notebook do Lucas' });
    });

    afterAll(async () => {
        await pg.end();
        await app.close();
        await isolated.drop();
    });

    beforeEach(async () => {
        await pg.query('DELETE FROM "Throttles"');
    });

    it('o token sai uma vez, o banco guarda só o hash e a listagem não o devolve', async () => {
        const stored = (
            await pg.query<{ tokenHash: string; tokenHint: string }>(
                `SELECT "tokenHash", "tokenHint" FROM "PlatformAccessTokens" WHERE id = $1`,
                [platformToken.id]
            )
        ).rows[0];
        const listed = await (await request('GET', '/platform/tokens', undefined, adminSession)).text();

        expect(platformToken.token).toMatch(/^vera_pat_/);
        expect(stored?.tokenHash).toBe(createHash('sha256').update(platformToken.token).digest('hex'));
        expect(stored?.tokenHint).toBe(platformToken.hint);
        expect(listed).toContain(platformToken.id);
        expect(listed).not.toContain(platformToken.token);
        expect(Date.parse(platformToken.expiresAt) - Date.now()).toBeGreaterThan(89 * DAY_MS);
        expect((await auditOf('platform_token.created'))[0]?.meta).toMatchObject({ tokenId: platformToken.id });
    });

    it('só a sessão do admin cria token: cliente leva 403 e o próprio token da plataforma leva 401', async () => {
        const asCustomer: Response = await request('POST', '/platform/tokens', { name: 'x' }, customerSession);
        const asToken: Response = await request('POST', '/platform/tokens', { name: 'x' }, platformToken.token);
        const tooLong: Response = await request('POST', '/platform/tokens', { name: 'x', expiresInDays: 400 }, adminSession);

        expect([asCustomer.status, asToken.status, tooLong.status]).toEqual([403, 401, 400]);
    });

    it('com um token válido lista as ferramentas e chama overview', async () => {
        const client: McpClient = await connect(platformToken.token);

        const tools = (await client.listTools()).tools.map((tool) => tool.name);
        const overview = await call(client, 'overview');
        await client.close();

        expect(tools).toEqual(
            expect.arrayContaining([
                'overview',
                'list_accounts',
                'get_account',
                'list_signup_links',
                'list_audit',
                'billing_status',
                'create_signup_link',
                'update_signup_link',
                'disable_signup_link',
                'billing_reconcile',
                'billing_replay_events'
            ])
        );
        expect(overview.isError).toBe(false);
        expect(JSON.parse(overview.text)).toMatchObject({ accounts: { total: 1 } });
        const used = (
            await pg.query<{ lastUsedAt: Date | null }>(`SELECT "lastUsedAt" FROM "PlatformAccessTokens" WHERE id = $1`, [platformToken.id])
        ).rows[0];
        expect(used?.lastUsedAt).not.toBeNull();
    });

    it('as leituras devolvem as contas, a visão da conta com motivo, a auditoria e o estado da cobrança', async () => {
        const client: McpClient = await connect(platformToken.token);

        const accounts = JSON.parse((await call(client, 'list_accounts', { search: 'cliente' })).text) as { items: { id: string }[] };
        const account = await call(client, 'get_account', { accountId: customerCompanyId, reason: 'Cliente pediu ajuda com a assinatura' });
        const audit = JSON.parse((await call(client, 'list_audit', { limit: 5 })).text) as { items: { action: string }[] };
        const billing = await call(client, 'billing_status');
        const links = await call(client, 'list_signup_links');
        await client.close();

        expect(accounts.items.map((item) => item.id)).toEqual([customerCompanyId]);
        expect(account.isError).toBe(false);
        expect(account.text).not.toMatch(/clientIdHint|itemIdHint|cardLast4/);
        expect(JSON.parse(account.text)).toMatchObject({ accountId: customerCompanyId });
        expect(audit.items.length).toBeGreaterThan(0);
        expect(JSON.parse(billing.text)).toMatchObject({ pastDueAccounts: 0, overdueInvoices: [], recentEvents: [] });
        expect(JSON.parse(links.text)).toEqual({ items: [] });
        expect((await auditOf('account.viewed')).at(-1)?.meta).toMatchObject({
            reason: 'Cliente pediu ajuda com a assinatura',
            layers: ['summary']
        });
    });

    it('get_account exige o motivo e não abre a conta de sistema nem uma inexistente', async () => {
        const client: McpClient = await connect(platformToken.token);
        const viewedBefore: number = (await auditOf('account.viewed')).length;

        const withoutReason = await call(client, 'get_account', { accountId: customerCompanyId, reason: 'oi' });
        const missing = await call(client, 'get_account', { accountId: crypto.randomUUID(), reason: 'Verificar cobrança' });
        await client.close();

        expect(withoutReason).toMatchObject({ isError: true, text: 'platform_mcp.invalid_arguments' });
        expect(missing).toMatchObject({ isError: true, text: 'platform.account_not_found' });
        expect(await auditOf('account.viewed')).toHaveLength(viewedBefore);
    });

    it('a escrita cria, edita e revoga o link e grava a auditoria de cada chamada, sem segredos nos argumentos', async () => {
        const client: McpClient = await connect(platformToken.token);

        const created = await call(client, 'create_signup_link', { label: 'Parceiros MCP', trial: { kind: 'none', days: null } });
        const link = JSON.parse(created.text) as { id: string; label: string };
        const updated = await call(client, 'update_signup_link', { id: link.id, label: 'Parceiros 2' });
        const revoked = await call(client, 'disable_signup_link', { id: link.id });
        const again = await call(client, 'update_signup_link', { id: link.id, label: 'Depois de revogado' });
        await client.close();

        expect(link.label).toBe('Parceiros MCP');
        expect(JSON.parse(updated.text)).toMatchObject({ label: 'Parceiros 2' });
        expect(JSON.parse(revoked.text)).toEqual({ revoked: true, id: link.id });
        expect(again).toMatchObject({ isError: true, text: 'signup_links.revoked' });
        expect(await auditOf('signup_link.created')).toHaveLength(1);
        const calls: AuditRow[] = await auditOf('mcp.tool_called');
        const writes: AuditRow[] = calls.filter((row: AuditRow) =>
            ['create_signup_link', 'update_signup_link', 'disable_signup_link'].includes(row.meta['tool'] as string)
        );
        expect(writes.map((row: AuditRow) => row.meta['outcome'])).toEqual(['ok', 'ok', 'ok', 'signup_links.revoked']);
        expect(writes[0]?.meta).toMatchObject({ tokenId: platformToken.id, arguments: { label: 'Parceiros MCP' } });
        expect(JSON.stringify(calls)).not.toContain(platformToken.token);
        const anonymous = await pg.query(
            `SELECT 1 FROM "PlatformAuditLog" WHERE action IN ('mcp.tool_called', 'signup_link.created') AND "operatorUserId" IS NULL`
        );
        expect(anonymous.rowCount).toBe(0);
    });

    it('billing_reconcile e billing_replay_events rodam; a janela precisa andar para frente e ter até 7 dias', async () => {
        const client: McpClient = await connect(platformToken.token);
        const now: number = Date.now();

        const reconcile = await call(client, 'billing_reconcile');
        const replay = await call(client, 'billing_replay_events', {
            from: new Date(now - DAY_MS).toISOString(),
            to: new Date(now).toISOString()
        });
        const backwards = await call(client, 'billing_replay_events', {
            from: new Date(now).toISOString(),
            to: new Date(now - DAY_MS).toISOString()
        });
        const tooWide = await call(client, 'billing_replay_events', {
            from: new Date(now - 8 * DAY_MS).toISOString(),
            to: new Date(now).toISOString()
        });
        await client.close();

        expect(reconcile.isError).toBe(false);
        expect(JSON.parse(reconcile.text)).toMatchObject({ checked: expect.any(Number) as number });
        expect(JSON.parse(replay.text)).toEqual({ republished: 0 });
        expect([backwards.text, tooWide.text]).toEqual(['platform_mcp.invalid_window', 'platform_mcp.invalid_window']);
    });

    it('sem token, com token desconhecido ou com um JWT de sessão responde 401', async () => {
        const body: unknown = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

        const none: Response = await request('POST', '/mcp', body);
        const unknown: Response = await request('POST', '/mcp', body, `vera_pat_${'a'.repeat(43)}`);
        const jwt: Response = await request('POST', '/mcp', body, adminSession);

        expect([none.status, unknown.status, jwt.status]).toEqual([401, 401, 401]);
    });

    it('token de quem não é da company de plataforma responde 403', async () => {
        const secret: string = `vera_pat_${crypto.randomUUID().replaceAll('-', '')}`;
        await pg.query(
            `INSERT INTO "PlatformAccessTokens" (id, name, "tokenHash", "tokenHint", "createdByUserId", "expiresAt") VALUES ($1, 'cliente', $2, 'xxxx', $3, now() + interval '1 day')`,
            [crypto.randomUUID(), createHash('sha256').update(secret).digest('hex'), customerUserId]
        );

        const response: Response = await request('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, secret);

        expect(response.status).toBe(403);
    });

    it('token expirado responde 401 e GET no /mcp responde 405', async () => {
        const expired: CreatedToken = await createToken({ name: 'vai expirar' });
        await pg.query(`UPDATE "PlatformAccessTokens" SET "expiresAt" = now() - interval '1 minute' WHERE id = $1`, [expired.id]);

        const late: Response = await request('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, expired.token);
        const get: Response = await request('GET', '/mcp', undefined, platformToken.token);

        expect([late.status, get.status]).toEqual([401, 405]);
    });

    it('revogar corta o acesso na hora, é repetível e audita; id desconhecido responde 404', async () => {
        const doomed: CreatedToken = await createToken({ name: 'vai ser revogado' });
        const body: unknown = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
        expect((await request('POST', '/mcp', body, doomed.token)).status).toBe(200);

        const first: Response = await request('DELETE', `/platform/tokens/${doomed.id}`, undefined, adminSession);
        const second: Response = await request('DELETE', `/platform/tokens/${doomed.id}`, undefined, adminSession);
        const unknown: Response = await request('DELETE', `/platform/tokens/${crypto.randomUUID()}`, undefined, adminSession);
        const after: Response = await request('POST', '/mcp', body, doomed.token);

        expect([first.status, second.status, unknown.status, after.status]).toEqual([204, 204, 404, 401]);
        expect(await auditOf('platform_token.revoked')).toHaveLength(2);
    });

    it('o limite por token responde 429 depois de 120 chamadas no minuto', async () => {
        const limited: CreatedToken = await createToken({ name: 'limite' });
        const body: unknown = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
        const statuses: number[] = [];

        for (let attempt: number = 0; attempt < 122; attempt += 1) {
            statuses.push((await request('POST', '/mcp', body, limited.token)).status);
        }

        expect(statuses.slice(0, 120).every((status: number) => status === 200)).toBe(true);
        expect(statuses.slice(120)).toEqual([429, 429]);
    });
});
