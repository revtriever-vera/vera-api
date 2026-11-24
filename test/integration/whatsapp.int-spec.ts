import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { Injectable, Module } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../src/core/context/app-context.port';
import { LogService } from '../../src/core/observability/log.service';
import { AccountDataRegistry } from '../../src/modules/identity/services/account-data.registry';
import { PaidFeatureAvailabilityRegistry } from '../../src/modules/plans/services/paid-feature-availability.registry';
import { InboundMessageHandler } from '../../src/modules/whatsapp/access/queue/inbound.handler';
import { MessageSendHandler } from '../../src/modules/whatsapp/access/queue/send.handler';
import { MessageStatusHandler } from '../../src/modules/whatsapp/access/queue/status.handler';
import { WebhookReceivedHandler } from '../../src/modules/whatsapp/access/queue/webhook.handler';
import { ChannelMaintenanceApplication } from '../../src/modules/whatsapp/application/channel-maintenance.application';
import { ChannelHealthDomain } from '../../src/modules/whatsapp/domain/channel-health.domain';
import { InboundMessage, WhatsAppChannel } from '../../src/modules/whatsapp/domain/whatsapp.types';
import { InboundDispatchPort } from '../../src/modules/whatsapp/services/inbound-dispatch.port';
import { SignatureVerifier } from '../../src/modules/whatsapp/services/signature.verifier';
import { WhatsAppOutboundService } from '../../src/modules/whatsapp/services/whatsapp-outbound.service';
import { WhatsAppDevController } from '../../src/modules/whatsapp/access/http/whatsapp-dev.controller';
import { QueueEnvelope } from '../../src/core/queue/queue.types';
import { Account, AllocationHarness } from './support/allocation-harness';
import { CapturingPublisher, PublishedMessage } from './support/queue';

const GOOD_KEY: string = 'sentinel-key-7c1d2e3f4a5b';
const GOOD_TOKEN: string = 'sentinel-token-9a8b7c6d5e4f';
const PHONE_A: string = '104857600000001';
const PHONE_B: string = '104857600000002';
const WABA_A: string = '200000000000001';
const WABA_B: string = '200000000000002';
const SECRET_A: string = 'app-secret-alice-1a2b3c4d5e';
const SECRET_B: string = 'app-secret-bob-9z8y7x6w5v';
const VERIFY_A: string = 'verify-token-alice-1a2b3c';
const VERIFY_B: string = 'verify-token-bob-9z8y7x';
const ALLOWED: string = '5511999990001';
const BLOCKED: string = '5511999990009';
const STRANGER: string = '5511999990077';
const HEADERS: Record<string, string> = { 'content-type': 'application/json' };

const dispatched: { message: InboundMessage; channel: WhatsAppChannel }[] = [];

@Injectable()
class DispatchProbe extends InboundDispatchPort {
    public async handle(message: InboundMessage, channel: WhatsAppChannel): Promise<void> {
        dispatched.push({ message, channel });
        return Promise.resolve();
    }
}

@Module({ providers: [DispatchProbe] })
class DispatchProbeModule {}

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
    const known: boolean = url.startsWith(`/${PHONE_A}`) || url.startsWith(`/${PHONE_B}`);
    answer(response, authorization === `Bearer ${GOOD_TOKEN}` && known ? 200 : 401, { verified_name: 'Loja' });
}

function listen(server: Server): Promise<number> {
    return new Promise((resolve: (port: number) => void): void => {
        server.listen(0, '127.0.0.1', (): void => {
            resolve((server.address() as AddressInfo).port);
        });
    });
}

const NOW_SECONDS: string = String(Math.floor(Date.now() / 1000));

function nowSeconds(): string {
    return NOW_SECONDS;
}

function messageBody(phoneNumberId: string, from: string, wamid: string, text: string): string {
    return JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
            {
                id: 'entry-1',
                changes: [
                    {
                        field: 'messages',
                        value: {
                            messaging_product: 'whatsapp',
                            metadata: { phone_number_id: phoneNumberId },
                            messages: [{ from, id: wamid, timestamp: nowSeconds(), type: 'text', text: { body: text } }]
                        }
                    }
                ]
            }
        ]
    });
}

function statusBody(phoneNumberId: string, wamid: string, status: string): string {
    return JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
            {
                id: 'entry-1',
                changes: [
                    {
                        field: 'messages',
                        value: {
                            messaging_product: 'whatsapp',
                            metadata: { phone_number_id: phoneNumberId },
                            statuses: [{ id: wamid, status, timestamp: nowSeconds(), pricing: { billable: true, category: 'utility' } }]
                        }
                    }
                ]
            }
        ]
    });
}

function envelopeOf(message: PublishedMessage): QueueEnvelope {
    return {
        type: message.type,
        requestId: 'int-test',
        companyId: null,
        occurredAt: new Date().toISOString(),
        trace: {},
        payload: message.payload
    };
}

describe('whatsapp (auto-hospedada, driver mock)', () => {
    const publisher: CapturingPublisher = new CapturingPublisher();
    const signer: SignatureVerifier = new SignatureVerifier();
    const logCalls: unknown[] = [];
    let harness: AllocationHarness;
    let server: Server;
    let alice: Account;
    let bob: Account;
    let cursor: number = 0;

    async function post(raw: string, secret: string): Promise<number> {
        const response = await harness.callText(
            'POST',
            '/whatsapp/webhook',
            { ...HEADERS, 'x-hub-signature-256': signer.sign(raw, secret) },
            raw
        );
        return response.status;
    }

    async function inWorker<T>(fn: () => Promise<T>): Promise<T> {
        return harness.app.get(AppContext).run({ requestId: 'int-test', locale: 'pt-BR' }, fn);
    }

    async function drain(companyId?: string): Promise<void> {
        while (cursor < publisher.published.length) {
            const message: PublishedMessage = publisher.published[cursor] as PublishedMessage;
            cursor += 1;
            const envelope: QueueEnvelope = envelopeOf(message);
            const run = async (): Promise<void> => handlerOf(message.type).handle(envelope);
            await (companyId === undefined ? inWorker(run) : harness.inCompany(companyId, run));
        }
    }

    function handlerOf(type: string): { handle: (envelope: QueueEnvelope) => Promise<void> } {
        const handlers: Record<string, new (...args: never[]) => { handle: (envelope: QueueEnvelope) => Promise<void> }> = {
            'whatsapp.webhook.received': WebhookReceivedHandler,
            'whatsapp.inbound.received': InboundMessageHandler,
            'whatsapp.status.received': MessageStatusHandler,
            'whatsapp.send.requested': MessageSendHandler
        };
        return harness.app.get(handlers[type] as never, { strict: false });
    }

    async function eventStatuses(): Promise<string[]> {
        const rows = await harness.pg.query<{ status: string }>('SELECT "status" FROM "WhatsAppWebhookEvents" ORDER BY "receivedAt", "id"');
        return rows.rows.map((row: { status: string }): string => row.status);
    }

    async function messagesOf(
        account: Account
    ): Promise<{ id: string; status: string; direction: string; kind: string; body: string | null }[]> {
        const rows = await harness.pg.query<{ id: string; status: string; direction: string; kind: string; body: string | null }>(
            'SELECT "id","status","direction","kind","body" FROM "WhatsAppMessages" WHERE "companyId" = $1 ORDER BY "createdAt","id"',
            [account.company.id]
        );
        return rows.rows;
    }

    beforeAll(async () => {
        server = createServer(provider);
        const base: string = `http://127.0.0.1:${String(await listen(server))}`;
        process.env['DEPLOYMENT_MODE'] = 'self_hosted';
        process.env['WHATSAPP_GRAPH_URL'] = base;
        process.env['WHATSAPP_ALLOWED_RECIPIENTS'] = ALLOWED;
        harness = await AllocationHarness.start('whatsapp_self', publisher, [DispatchProbeModule]);
        alice = await harness.signUp('alice');
        bob = await harness.signUp('bob');
        const logs: LogService = harness.app.get(LogService, { strict: false });
        for (const level of ['info', 'warn', 'error', 'debug'] as const) {
            vi.spyOn(logs, level).mockImplementation((entry: unknown): void => {
                logCalls.push(entry);
            });
        }
        await harness.call(alice.token, 'PUT', '/integrations/llm', { baseUrl: base, apiKey: GOOD_KEY, model: 'model-a' });
        for (const [account, phone, waba, verify, secret] of [
            [alice, PHONE_A, WABA_A, VERIFY_A, SECRET_A],
            [bob, PHONE_B, WABA_B, VERIFY_B, SECRET_B]
        ] as const) {
            const saved = await harness.call(account.token, 'PUT', '/integrations/whatsapp', {
                accessToken: GOOD_TOKEN,
                phoneNumberId: phone,
                verifyToken: verify,
                appSecret: secret,
                wabaId: waba
            });
            expect(saved.status).toBe(200);
        }
    });

    afterAll(async () => {
        delete process.env['DEPLOYMENT_MODE'];
        delete process.env['WHATSAPP_GRAPH_URL'];
        delete process.env['WHATSAPP_ALLOWED_RECIPIENTS'];
        await harness.stop();
        server.close();
    });

    it('verifica o webhook com o token de cada company e recusa modo ou token errados', async () => {
        const query = (mode: string, token: string): string =>
            `/whatsapp/webhook?hub.mode=${mode}&hub.verify_token=${token}&hub.challenge=desafio-abc`;

        const bobOk = await harness.callText('GET', query('subscribe', VERIFY_B));
        const aliceOk = await harness.callText('GET', query('subscribe', VERIFY_A));

        expect(bobOk).toMatchObject({ status: 200, text: 'desafio-abc' });
        expect(bobOk.contentType).toContain('text/plain');
        expect(aliceOk.status).toBe(200);
        const refused = await harness.callText('GET', query('unsubscribe', VERIFY_A));
        expect(refused.status).toBe(403);
        expect(refused.contentType).toContain('application/problem+json');
        expect((await harness.callText('GET', query('subscribe', 'errado'))).status).toBe(403);
        expect((await harness.callText('GET', '/whatsapp/webhook')).status).toBe(403);
    });

    it('POST assinado: grava antes do 200, publica só o id e a mensagem cai na company do número', async () => {
        const raw: string = messageBody(PHONE_A, ALLOWED, 'wamid.in.1', 'oi, tudo bem?');

        expect(await post(raw, SECRET_A)).toBe(200);

        expect(await eventStatuses()).toEqual(['received']);
        const published: PublishedMessage[] = publisher.ofType('whatsapp.webhook.received');
        const event = await harness.pg.query<{ id: string }>('SELECT "id" FROM "WhatsAppWebhookEvents"');
        expect(published).toHaveLength(1);
        expect(published[0]?.payload).toEqual({ eventId: event.rows[0]?.id });
        expect(published[0]?.options?.jobId).toBe(`wa-webhook-${String(event.rows[0]?.id)}`);

        await drain();

        expect(await eventStatuses()).toEqual(['processed']);
        expect(publisher.ofType('whatsapp.inbound.received')[0]?.options?.jobId).toBe('wa-inbound-wamid.in.1');
        expect(await messagesOf(alice)).toMatchObject([{ direction: 'in', kind: 'text', status: 'received', body: 'oi, tudo bem?' }]);
        expect(await messagesOf(bob)).toEqual([]);
        expect(dispatched).toHaveLength(1);
        expect(dispatched[0]?.channel.companyId).toBe(alice.company.id);
        expect(dispatched[0]?.message).toMatchObject({ wamid: 'wamid.in.1', from: ALLOWED, kind: 'text' });
    });

    it('o mesmo POST de novo não duplica o evento nem processa de novo', async () => {
        const raw: string = messageBody(PHONE_A, ALLOWED, 'wamid.in.1', 'oi, tudo bem?');

        expect(await post(raw, SECRET_A)).toBe(200);
        await drain();

        expect(await eventStatuses()).toEqual(['processed']);
        expect(publisher.ofType('whatsapp.webhook.received')).toHaveLength(1);
        expect(await messagesOf(alice)).toHaveLength(1);
        expect(dispatched).toHaveLength(1);
    });

    it('assinatura errada: responde 200, o evento fica rejected e nada vira mensagem', async () => {
        const raw: string = messageBody(PHONE_A, ALLOWED, 'wamid.in.evil', 'texto forjado');

        expect(await post(raw, SECRET_B)).toBe(200);
        await drain();

        expect(await eventStatuses()).toEqual(['processed', 'rejected']);
        expect((await messagesOf(alice)).map((message) => message.body)).toEqual(['oi, tudo bem?']);
        expect(await messagesOf(bob)).toEqual([]);
    });

    it('número desconhecido e corpo sem assinatura também ficam rejected', async () => {
        const unknown: string = messageBody('999999999999999', ALLOWED, 'wamid.in.unknown', 'x');
        const unsigned: string = messageBody(PHONE_B, ALLOWED, 'wamid.in.unsigned', 'y');

        expect(await post(unknown, SECRET_A)).toBe(200);
        expect((await harness.callText('POST', '/whatsapp/webhook', HEADERS, unsigned)).status).toBe(200);
        await drain();

        expect((await eventStatuses()).slice(-2)).toEqual(['rejected', 'rejected']);
        expect(await messagesOf(bob)).toEqual([]);
    });

    it('o Swagger descreve o webhook e esconde as rotas de dev', () => {
        const document: OpenAPIObject = SwaggerModule.createDocument(harness.app, new DocumentBuilder().build());

        expect(Object.keys(document.paths).filter((path: string): boolean => path.startsWith('/whatsapp'))).toEqual([
            '/whatsapp/webhook',
            '/whatsapp/link',
            '/whatsapp/link/code'
        ]);
        expect(Object.keys(document.paths['/whatsapp/webhook'] ?? {}).sort()).toEqual(['get', 'post']);
    });

    it('recusa Content-Type que não é JSON', async () => {
        const response = await harness.callText('POST', '/whatsapp/webhook', { 'content-type': 'text/plain' }, 'x');

        expect(response.status).toBe(415);
    });

    it('texto com janela fechada lança whatsapp.window_closed; com a janela aberta enfileira e envia', async () => {
        const outbound: WhatsAppOutboundService = harness.app.get(WhatsAppOutboundService, { strict: false });

        await expect(harness.inCompany(alice.company.id, async () => outbound.enqueueText(STRANGER, 'oi'))).rejects.toMatchObject({
            code: 'whatsapp.window_closed'
        });

        const ids: string[] = await harness.inCompany(alice.company.id, async () => outbound.enqueueText(ALLOWED, '**Total** pago'));
        expect(ids).toHaveLength(1);
        const queued = publisher.ofType('whatsapp.send.requested').at(-1);
        expect(queued?.payload).toEqual({ messageId: ids[0] });
        expect(queued?.options).toMatchObject({ jobId: `wa-send-${String(ids[0])}`, attempts: 3 });
        expect((await messagesOf(alice)).find((message) => message.id === ids[0])?.status).toBe('queued');

        await drain(alice.company.id);

        const sent = (await messagesOf(alice)).find((message) => message.id === ids[0]);
        expect(sent).toMatchObject({ status: 'sent', body: '*Total* pago' });
        const dev = harness.app.get(WhatsAppDevController, { strict: false });
        expect(dev.messages().items.at(-1)).toMatchObject({ kind: 'text', body: '*Total* pago', to: ALLOWED });
    });

    it('o status da Meta avança a mensagem de saída e um status atrasado não a faz voltar', async () => {
        const row = await harness.pg.query<{ externalId: string }>(
            `SELECT "externalId" FROM "WhatsAppMessages" WHERE "companyId" = $1 AND "direction" = 'out'`,
            [alice.company.id]
        );
        const wamid: string = row.rows[0]?.externalId ?? '';
        expect(wamid.startsWith('wamid.mock.')).toBe(true);

        expect(await post(statusBody(PHONE_A, wamid, 'delivered'), SECRET_A)).toBe(200);
        await drain();
        expect(await post(statusBody(PHONE_A, wamid, 'sent'), SECRET_A)).toBe(200);
        await drain();

        const after = await harness.pg.query<{ status: string; pricingCategory: string; billable: boolean; deliveredAt: Date | null }>(
            `SELECT "status","pricingCategory","billable","deliveredAt" FROM "WhatsAppMessages" WHERE "externalId" = $1`,
            [wamid]
        );
        expect(after.rows[0]).toMatchObject({ status: 'delivered', pricingCategory: 'utility', billable: true });
        expect(after.rows[0]?.deliveredAt).not.toBeNull();
    });

    it('envio fora da allowlist fica blocked e não chega ao provedor', async () => {
        const outbound: WhatsAppOutboundService = harness.app.get(WhatsAppOutboundService, { strict: false });
        expect(await post(messageBody(PHONE_A, BLOCKED, 'wamid.in.blocked', 'oi'), SECRET_A)).toBe(200);
        await drain();
        const dev = harness.app.get(WhatsAppDevController, { strict: false });
        const before: number = dev.messages().items.length;

        const ids: string[] = await harness.inCompany(alice.company.id, async () => outbound.enqueueText(BLOCKED, 'não deve sair'));
        await drain(alice.company.id);

        expect((await messagesOf(alice)).find((message) => message.id === ids[0])).toMatchObject({ status: 'blocked' });
        expect(dev.messages().items).toHaveLength(before);
    });

    it('template não aprovado lança template_unavailable; o sync grava o status e libera o envio', async () => {
        const outbound: WhatsAppOutboundService = harness.app.get(WhatsAppOutboundService, { strict: false });
        const maintenance: ChannelMaintenanceApplication = harness.app.get(ChannelMaintenanceApplication, { strict: false });

        await expect(
            harness.inCompany(alice.company.id, async () => outbound.enqueueTemplate(ALLOWED, 'vera_lembrete', 'pt_BR', ['pagar']))
        ).rejects.toMatchObject({ code: 'whatsapp.template_unavailable' });

        await inWorker(async () => maintenance.syncTemplates());
        await inWorker(async () => maintenance.syncTemplates());

        const registrations = await harness.pg.query<{ channelKey: string; language: string; status: string }>(
            'SELECT "channelKey","language","status" FROM "WhatsAppTemplateRegistrations" ORDER BY "channelKey","language"'
        );
        expect(registrations.rows).toEqual([
            { channelKey: PHONE_A, language: 'en', status: 'approved' },
            { channelKey: PHONE_A, language: 'pt_BR', status: 'approved' },
            { channelKey: PHONE_B, language: 'en', status: 'approved' },
            { channelKey: PHONE_B, language: 'pt_BR', status: 'approved' }
        ]);

        const id: string = await harness.inCompany(alice.company.id, async () =>
            outbound.enqueueTemplate(STRANGER, 'vera_lembrete', 'pt_BR', ['pagar'])
        );
        await drain(alice.company.id);

        expect((await messagesOf(alice)).find((message) => message.id === id)).toMatchObject({ kind: 'template', status: 'blocked' });
    });

    it('availability: só a company com canal e chave do modelo; token inválido derruba', async () => {
        const availability: PaidFeatureAvailabilityRegistry = harness.app.get(PaidFeatureAvailabilityRegistry, { strict: false });
        const health: ChannelHealthDomain = harness.app.get(ChannelHealthDomain, { strict: false });

        expect(await harness.inCompany(alice.company.id, async () => availability.enabled('whatsapp'))).toBe(true);
        expect(await harness.inCompany(bob.company.id, async () => availability.enabled('whatsapp'))).toBe(false);

        await health.markTokenInvalid(PHONE_A);
        expect(await harness.inCompany(alice.company.id, async () => availability.enabled('whatsapp'))).toBe(false);
        await inWorker(async () => harness.app.get(ChannelMaintenanceApplication, { strict: false }).checkHealth());
        expect(await harness.inCompany(alice.company.id, async () => availability.enabled('whatsapp'))).toBe(true);
    });

    it('retenção zera o texto vencido, mantém os metadados e apaga os eventos antigos', async () => {
        const maintenance: ChannelMaintenanceApplication = harness.app.get(ChannelMaintenanceApplication, { strict: false });
        await harness.pg.query(
            `INSERT INTO "WhatsAppMessages" ("id","companyId","peer","direction","kind","status","body","createdAt")
             VALUES ($1,$2,$3,'in','text','received','texto antigo', now() - interval '40 days')`,
            [crypto.randomUUID(), alice.company.id, ALLOWED]
        );
        await harness.pg.query(
            `INSERT INTO "WhatsAppWebhookEvents" ("id","bodySha256","rawBody","status","receivedAt")
             VALUES ($1,'old-sha','{}','processed', now() - interval '10 days'), ($2,'old-sha-2','{}','received', now() - interval '10 days')`,
            [crypto.randomUUID(), crypto.randomUUID()]
        );

        await inWorker(async () => maintenance.purge());

        const old = await harness.pg.query(`SELECT "body","status" FROM "WhatsAppMessages" WHERE "createdAt" < now() - interval '30 days'`);
        expect(old.rows).toEqual([{ body: null, status: 'received' }]);
        const recent = await harness.pg.query<{ total: number }>(
            `SELECT count(*)::int AS total FROM "WhatsAppMessages" WHERE "body" IS NOT NULL`
        );
        expect(recent.rows[0]?.total).toBeGreaterThan(0);
        const events = await harness.pg.query(`SELECT "bodySha256" FROM "WhatsAppWebhookEvents" WHERE "bodySha256" LIKE 'old-sha%'`);
        expect(events.rows).toEqual([{ bodySha256: 'old-sha-2' }]);
    });

    it('exporta sem o número em claro e o apagador remove as mensagens da company', async () => {
        const registry: AccountDataRegistry = harness.app.get(AccountDataRegistry, { strict: false });

        const sections = await harness.inCompany(alice.company.id, async () => registry.exportSections(alice.company.id));
        const exported: string = JSON.stringify(sections['whatsapp']);
        expect(exported).toContain('"peerLastDigits":"0001"');
        expect(exported).not.toContain(ALLOWED);

        const erased = await harness.inCompany(alice.company.id, async () => registry.eraseAll(alice.company.id));
        expect(erased).toContainEqual({ area: 'whatsapp_messages', erased: expect.any(Number) });
        expect(await messagesOf(alice)).toEqual([]);
    });

    it('os logs de um ciclo completo não têm número, token, app secret nem texto', () => {
        const dump: string = JSON.stringify(logCalls);

        expect(logCalls.length).toBeGreaterThan(0);
        for (const secret of [
            GOOD_TOKEN,
            GOOD_KEY,
            SECRET_A,
            SECRET_B,
            VERIFY_A,
            VERIFY_B,
            ALLOWED,
            BLOCKED,
            STRANGER,
            'oi, tudo bem?',
            'Total',
            'texto forjado',
            'pagar'
        ]) {
            expect(dump).not.toContain(secret);
        }
    });
});

const HOSTED_ENV: Record<string, string> = {
    WHATSAPP_ACCESS_TOKEN: 'hosted-token-1a2b3c4d5e6f',
    WHATSAPP_PHONE_NUMBER_ID: '104857600000099',
    WHATSAPP_VERIFY_TOKEN: 'hosted-verify-1a2b3c4d',
    WHATSAPP_APP_SECRET: 'hosted-app-secret-1a2b3c4d',
    WHATSAPP_WABA_ID: '200000000000099'
};

describe('whatsapp (hospedada, driver mock)', () => {
    const publisher: CapturingPublisher = new CapturingPublisher();
    const signer: SignatureVerifier = new SignatureVerifier();
    let harness: AllocationHarness;

    beforeAll(async () => {
        process.env['DEPLOYMENT_MODE'] = 'hosted';
        Object.assign(process.env, HOSTED_ENV);
        harness = await AllocationHarness.start('whatsapp_hosted', publisher, [DispatchProbeModule]);
    });

    afterAll(async () => {
        delete process.env['DEPLOYMENT_MODE'];
        for (const key of Object.keys(HOSTED_ENV)) {
            Reflect.deleteProperty(process.env, key);
        }
        await harness.stop();
    });

    it('usa o canal único da instância: verifica, valida a assinatura e despacha sem company', async () => {
        const verify = await harness.callText(
            'GET',
            `/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${String(HOSTED_ENV['WHATSAPP_VERIFY_TOKEN'])}&hub.challenge=hosted-ok`
        );
        expect(verify).toMatchObject({ status: 200, text: 'hosted-ok' });
        const before: number = dispatched.length;
        const raw: string = messageBody(String(HOSTED_ENV['WHATSAPP_PHONE_NUMBER_ID']), ALLOWED, 'wamid.hosted.1', 'oi da hospedada');

        const response = await harness.callText(
            'POST',
            '/whatsapp/webhook',
            { ...HEADERS, 'x-hub-signature-256': signer.sign(raw, String(HOSTED_ENV['WHATSAPP_APP_SECRET'])) },
            raw
        );
        expect(response.status).toBe(200);
        const first: PublishedMessage = publisher.ofType('whatsapp.webhook.received')[0] as PublishedMessage;
        await harness.app.get(WebhookReceivedHandler, { strict: false }).handle(envelopeOf(first));
        const inbound: PublishedMessage = publisher.ofType('whatsapp.inbound.received')[0] as PublishedMessage;
        await harness.app.get(InboundMessageHandler, { strict: false }).handle(envelopeOf(inbound));

        const events = await harness.pg.query<{ status: string; channelKey: string }>(
            'SELECT "status","channelKey" FROM "WhatsAppWebhookEvents"'
        );
        expect(events.rows).toEqual([{ status: 'processed', channelKey: 'hosted' }]);
        expect(dispatched).toHaveLength(before + 1);
        expect(dispatched.at(-1)?.channel.companyId).toBeNull();
        const messages = await harness.pg.query('SELECT 1 FROM "WhatsAppMessages"');
        expect(messages.rowCount).toBe(0);
    });

    it('a availability da hospedada depende só do canal e do token', async () => {
        const availability: PaidFeatureAvailabilityRegistry = harness.app.get(PaidFeatureAvailabilityRegistry, { strict: false });
        const health: ChannelHealthDomain = harness.app.get(ChannelHealthDomain, { strict: false });

        expect(await availability.enabled('whatsapp')).toBe(true);
        await health.markTokenInvalid('hosted');
        expect(await availability.enabled('whatsapp')).toBe(false);
    });
});

describe('whatsapp (hospedada sem configuração)', () => {
    const publisher: CapturingPublisher = new CapturingPublisher();
    const signer: SignatureVerifier = new SignatureVerifier();
    let harness: AllocationHarness;

    beforeAll(async () => {
        process.env['DEPLOYMENT_MODE'] = 'hosted';
        harness = await AllocationHarness.start('whatsapp_unconfigured', publisher, [DispatchProbeModule]);
    });

    afterAll(async () => {
        delete process.env['DEPLOYMENT_MODE'];
        await harness.stop();
    });

    it('sem app secret o job falha e o evento continua reprocessável; a verificação e a availability recusam', async () => {
        const raw: string = messageBody('104857600000099', ALLOWED, 'wamid.unconfigured', 'oi');

        const response = await harness.callText(
            'POST',
            '/whatsapp/webhook',
            { ...HEADERS, 'x-hub-signature-256': signer.sign(raw, 'qualquer') },
            raw
        );
        expect(response.status).toBe(200);
        const job: PublishedMessage = publisher.ofType('whatsapp.webhook.received')[0] as PublishedMessage;
        const handler: WebhookReceivedHandler = harness.app.get(WebhookReceivedHandler, { strict: false });

        await expect(handler.handle(envelopeOf(job))).rejects.toThrow('whatsapp_misconfigured');
        await expect(handler.handle(envelopeOf(job))).rejects.toThrow('whatsapp_misconfigured');

        const events = await harness.pg.query<{ status: string }>('SELECT "status" FROM "WhatsAppWebhookEvents"');
        expect(events.rows).toEqual([{ status: 'received' }]);
        const verify = await harness.callText('GET', '/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1');
        expect(verify.status).toBe(403);
        const availability: PaidFeatureAvailabilityRegistry = harness.app.get(PaidFeatureAvailabilityRegistry, { strict: false });
        expect(await availability.enabled('whatsapp')).toBe(false);
    });
});
