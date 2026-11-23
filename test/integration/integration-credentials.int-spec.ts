import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { Injectable, Module } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LogService } from '../../src/core/observability/log.service';
import { IntegrationCredentialsApplicationModule } from '../../src/modules/integration-credentials/application/integration-credentials-application.module';
import { IntegrationKind } from '../../src/modules/integration-credentials/domain/integration.types';
import { IntegrationCredentialsService } from '../../src/modules/integration-credentials/services/integration-credentials.service';
import { IntegrationRemovedPort } from '../../src/modules/integration-credentials/services/integration-removed.port';
import { AccountDataRegistry } from '../../src/modules/identity/services/account-data.registry';
import { asRole } from '../support/as-role';
import { Account, AllocationHarness } from './support/allocation-harness';

const GOOD_KEY: string = 'sentinel-key-7c1d2e3f4a5b';
const GOOD_TOKEN: string = 'sentinel-token-9a8b7c6d5e4f';
const PHONE_ID: string = '104857600000001';
const GOOGLE_ID: string = '123456789-abc.apps.googleusercontent.com';
const removals: string[] = [];

@Injectable()
class WhatsAppRemoved extends IntegrationRemovedPort {
    public readonly kind: IntegrationKind = 'whatsapp';
    public async onRemoved(): Promise<void> {
        removals.push('whatsapp');
        return Promise.resolve();
    }
}

@Module({ imports: [IntegrationCredentialsApplicationModule], providers: [WhatsAppRemoved] })
class RemovalProbeModule {}

interface Item {
    readonly kind: string;
    readonly configured: boolean;
    readonly hint: string | null;
    readonly public: Record<string, string>;
}

interface ListBody {
    readonly items: Item[];
    readonly webhookUrl: string;
    readonly googleRedirectUri: string;
}

interface ProblemBody {
    readonly type: string;
    readonly meta?: { reason?: string };
}

function answer(response: ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
}

function provider(request: IncomingMessage, response: ServerResponse): void {
    const authorization: string = request.headers.authorization ?? '';
    const url: string = request.url ?? '';
    if (url.startsWith('/models')) {
        answer(response, authorization === `Bearer ${GOOD_KEY}` ? 200 : 401, { data: [{ id: 'model-a' }] });
        return;
    }
    if (authorization !== `Bearer ${GOOD_TOKEN}`) {
        answer(response, 401, {});
        return;
    }
    answer(response, url.startsWith(`/${PHONE_ID}`) || url.startsWith('/104857600000002') ? 200 : 404, { verified_name: 'Loja' });
}

function listen(server: Server): Promise<number> {
    return new Promise((resolve: (port: number) => void): void => {
        server.listen(0, '127.0.0.1', (): void => {
            resolve((server.address() as AddressInfo).port);
        });
    });
}

describe('integration credentials (self_hosted)', () => {
    let harness: AllocationHarness;
    let server: Server;
    let base: string;
    let alice: Account;
    let bob: Account;
    const infoSpy = { calls: [] as unknown[] };

    beforeAll(async () => {
        server = createServer(provider);
        base = `http://127.0.0.1:${String(await listen(server))}`;
        process.env['DEPLOYMENT_MODE'] = 'self_hosted';
        process.env['WHATSAPP_GRAPH_URL'] = base;
        process.env['PUBLIC_API_URL'] = 'https://vera.example.com';
        harness = await AllocationHarness.start('integrations_self', undefined, [RemovalProbeModule]);
        alice = await harness.signUp('alice');
        bob = await harness.signUp('bob');
        const logs: LogService = harness.app.get(LogService, { strict: false });
        for (const level of ['info', 'warn', 'error', 'debug'] as const) {
            vi.spyOn(logs, level).mockImplementation((entry: unknown): void => {
                infoSpy.calls.push(entry);
            });
        }
    });

    afterAll(async () => {
        delete process.env['DEPLOYMENT_MODE'];
        delete process.env['WHATSAPP_GRAPH_URL'];
        delete process.env['PUBLIC_API_URL'];
        await harness.stop();
        server.close();
    });

    it('exige sessão e papel de dono', async () => {
        const editor: Account = await asRole(harness, alice, 'editor');

        expect((await harness.call(null, 'GET', '/integrations')).status).toBe(401);
        expect((await harness.call(editor.token, 'GET', '/integrations')).status).toBe(403);
        expect((await harness.call(editor.token, 'DELETE', '/integrations/llm')).status).toBe(403);
    });

    it('grava o modelo selado depois do teste e o GET mostra só a dica', async () => {
        const saved = await harness.call<Item>(alice.token, 'PUT', '/integrations/llm', {
            baseUrl: base,
            apiKey: GOOD_KEY,
            model: 'model-a'
        });
        expect(saved.status).toBe(200);
        expect(saved.body).toMatchObject({ kind: 'llm', configured: true, hint: `…${GOOD_KEY.slice(-4)}` });

        const listed = await harness.call<ListBody>(alice.token, 'GET', '/integrations');
        expect(JSON.stringify(listed.body)).not.toContain(GOOD_KEY);
        expect(listed.body.webhookUrl).toBe('https://vera.example.com/api/whatsapp');
        expect(listed.body.googleRedirectUri).toBe('https://vera.example.com/api/google/callback');
        expect(listed.body.items.find((item: Item) => item.kind === 'llm')?.public['model']).toBe('model-a');

        const rows = await harness.pg.query('SELECT 1 FROM "IntegrationCredentials" WHERE "sealed" LIKE $1', [`%${GOOD_KEY}%`]);
        expect(rows.rowCount).toBe(0);
        const resolved = await harness.inCompany(alice.company.id, async () =>
            harness.app.get(IntegrationCredentialsService, { strict: false }).resolve('llm')
        );
        expect(resolved).toMatchObject({ apiKey: GOOD_KEY, provider: 'openai_compatible', model: 'model-a' });
    });

    it('não grava quando o teste falha e mantém a chave anterior', async () => {
        const wrongKey = await harness.call<ProblemBody>(alice.token, 'PUT', '/integrations/llm', {
            baseUrl: base,
            apiKey: 'wrong-key-0000000000',
            model: 'model-a'
        });
        const wrongModel = await harness.call<ProblemBody>(alice.token, 'PUT', '/integrations/llm', {
            baseUrl: base,
            apiKey: GOOD_KEY,
            model: 'model-z'
        });

        expect(wrongKey).toMatchObject({ status: 422, body: { type: 'integrations.test_failed', meta: { reason: 'unauthorized' } } });
        expect(wrongModel.body.meta?.reason).toBe('invalid_model');
        expect(JSON.stringify(wrongKey.body)).not.toContain('wrong-key');
        const listed = await harness.call<ListBody>(alice.token, 'GET', '/integrations');
        expect(listed.body.items.find((item: Item) => item.kind === 'llm')?.hint).toBe(`…${GOOD_KEY.slice(-4)}`);
    });

    it('recusa endereço de metadados, esquema estranho e não ecoa o corpo', async () => {
        const metadata = await harness.call<ProblemBody & { meta?: unknown }>(alice.token, 'PUT', '/integrations/llm', {
            baseUrl: 'http://169.254.169.254/latest',
            apiKey: GOOD_KEY,
            model: 'model-a'
        });
        const scheme = await harness.call<ProblemBody>(alice.token, 'PUT', '/integrations/llm', {
            baseUrl: 'ftp://example.com',
            apiKey: GOOD_KEY,
            model: 'model-a'
        });

        expect(metadata.status).toBe(400);
        expect(metadata.body.type).toBe('validation_failed');
        expect(scheme.status).toBe(400);
        expect(JSON.stringify(metadata.body)).not.toContain(GOOD_KEY);
    });

    it('grava o WhatsApp e o Google e recusa o mesmo número em duas contas', async () => {
        const body = { accessToken: GOOD_TOKEN, phoneNumberId: PHONE_ID, verifyToken: 'verify-token-123', appSecret: 'app-secret-12345' };

        const first = await harness.call<Item>(alice.token, 'PUT', '/integrations/whatsapp', body);
        const second = await harness.call<ProblemBody>(bob.token, 'PUT', '/integrations/whatsapp', body);
        const google = await harness.call<Item>(alice.token, 'PUT', '/integrations/google', {
            clientId: GOOGLE_ID,
            clientSecret: 'google-secret-12345'
        });
        const missing = await harness.call<ProblemBody>(bob.token, 'PUT', '/integrations/whatsapp', {
            ...body,
            phoneNumberId: '999999999'
        });

        expect(first.status).toBe(200);
        expect(first.body.public['phoneNumberId']).toBe(PHONE_ID);
        expect(second).toMatchObject({ status: 409, body: { type: 'integrations.phone_in_use' } });
        expect(google.body).toMatchObject({ kind: 'google', configured: true, public: { clientId: GOOGLE_ID } });
        expect(missing.body.meta?.reason).toBe('not_found');
    });

    it('acha a company pelo número sem contexto', async () => {
        const rows = await harness.pg.query<{ companyId: string }>(
            'SELECT "companyId" FROM "IntegrationCredentials" WHERE "phoneNumberId" = $1',
            [PHONE_ID]
        );

        expect(rows.rows[0]?.companyId).toBe(alice.company.id);
    });

    it('isola as companies', async () => {
        const listed = await harness.call<ListBody>(bob.token, 'GET', '/integrations');

        expect(listed.body.items.every((item: Item) => !item.configured)).toBe(true);
        const resolved = await harness.inCompany(bob.company.id, async () =>
            harness.app.get(IntegrationCredentialsService, { strict: false }).resolve('llm')
        );
        expect(resolved).toBeNull();
    });

    it('remove chamando as portas registradas e a função volta a null', async () => {
        const removed = await harness.call(alice.token, 'DELETE', '/integrations/whatsapp');

        expect(removed.status).toBe(204);
        expect(removals).toEqual(['whatsapp']);
        const service: IntegrationCredentialsService = harness.app.get(IntegrationCredentialsService, { strict: false });
        expect(await harness.inCompany(alice.company.id, async () => service.has('whatsapp'))).toBe(false);
        expect((await harness.call(alice.token, 'DELETE', '/integrations/nope')).status).toBe(400);
    });

    it('nunca põe chave ou token nos logs', () => {
        const logged: string = JSON.stringify(infoSpy.calls);

        expect(logged).toContain('integration saved');
        expect(logged).toContain('integration test failed');
        for (const secret of [GOOD_KEY, GOOD_TOKEN, 'wrong-key', 'app-secret-12345', 'google-secret-12345']) {
            expect(logged).not.toContain(secret);
        }
    });

    it('a exclusão da conta apaga as linhas', async () => {
        const registry: AccountDataRegistry = harness.app.get(AccountDataRegistry, { strict: false });

        await harness.inCompany(alice.company.id, async () => registry.eraseAll(alice.company.id));

        const rows = await harness.pg.query('SELECT 1 FROM "IntegrationCredentials" WHERE "companyId" = $1', [alice.company.id]);
        expect(rows.rowCount).toBe(0);
    });
});

describe('integration credentials (hosted)', () => {
    let harness: AllocationHarness;
    let alice: Account;

    beforeAll(async () => {
        process.env['AI_GATEWAY_API_KEY'] = 'gateway-key-123456';
        process.env['LLM_MODEL'] = 'catalog-model';
        process.env['LLM_PRICE_TABLE'] = JSON.stringify({ 'catalog-model': { input: 1, output: 2, cacheRead: 0 } });
        harness = await AllocationHarness.start('integrations_hosted');
        alice = await harness.signUp('alice');
    });

    afterAll(async () => {
        delete process.env['AI_GATEWAY_API_KEY'];
        delete process.env['LLM_MODEL'];
        delete process.env['LLM_PRICE_TABLE'];
        await harness.stop();
    });

    it('responde 404 em todas as rotas', async () => {
        const body = { baseUrl: 'https://llm.example.com/v1', apiKey: GOOD_KEY, model: 'm' };
        const statuses: number[] = [
            (await harness.call(alice.token, 'GET', '/integrations')).status,
            (await harness.call(alice.token, 'PUT', '/integrations/llm', body)).status,
            (await harness.call(alice.token, 'PUT', '/integrations/google', { clientId: GOOGLE_ID, clientSecret: 'google-secret-12345' }))
                .status,
            (await harness.call(alice.token, 'DELETE', '/integrations/llm')).status
        ];

        expect(statuses).toEqual([404, 404, 404, 404]);
    });

    it('resolve usa a instância e ignora a tabela', async () => {
        await harness.pg.query(
            `INSERT INTO "IntegrationCredentials" ("id","companyId","kind","sealed","sealerDriver","hint","verifiedAt") VALUES ($1,$2,'llm','x','local','…x',now())`,
            [crypto.randomUUID(), alice.company.id]
        );
        const service: IntegrationCredentialsService = harness.app.get(IntegrationCredentialsService, { strict: false });

        const llm = await harness.inCompany(alice.company.id, async () => service.resolve('llm'));
        const google = await harness.inCompany(alice.company.id, async () => service.resolve('google'));

        expect(llm).toMatchObject({ provider: 'gateway', apiKey: 'gateway-key-123456', model: 'catalog-model' });
        expect(google).toBeNull();
    });
});
