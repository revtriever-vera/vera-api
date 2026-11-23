import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { Injectable, Module } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppContext } from '../../src/core/context/app-context.port';
import { QueueEnvelope } from '../../src/core/queue/queue.types';
import { UserDomain } from '../../src/modules/identity/domain/user.domain';
import { User } from '../../src/modules/identity/domain/identity.types';
import { AuthTokens, SessionIssuerPort } from '../../src/modules/identity/ports/session-issuer.port';
import { AccountDataRegistry } from '../../src/modules/identity/services/account-data.registry';
import { PlanContractService } from '../../src/modules/plans/services/plan-contract.service';
import { InboundMessageHandler } from '../../src/modules/whatsapp/access/queue/inbound.handler';
import { MessageSendHandler } from '../../src/modules/whatsapp/access/queue/send.handler';
import { WebhookReceivedHandler } from '../../src/modules/whatsapp/access/queue/webhook.handler';
import { MockOutbox, MockSentMessage } from '../../src/modules/whatsapp/services/mock-outbox.service';
import { SignatureVerifier } from '../../src/modules/whatsapp/services/signature.verifier';
import { WhatsAppChannelService } from '../../src/modules/whatsapp/services/whatsapp-channel.service';
import { WhatsAppLinksStaleTickHandler } from '../../src/modules/whatsapp-link/access/commands/links-stale.command';
import { linkTextsFor } from '../../src/modules/whatsapp-link/domain/link-texts';
import { LinkResolverService } from '../../src/modules/whatsapp-link/services/link-resolver.service';
import { ReminderCancellationPort } from '../../src/modules/whatsapp-link/services/reminder-cancellation.port';
import { WhatsAppMemberLifecycle } from '../../src/modules/whatsapp-link/services/whatsapp-member.lifecycle';
import { Account, AllocationHarness } from './support/allocation-harness';
import { CapturingPublisher, PublishedMessage } from './support/queue';

const canceled: string[] = [];

@Injectable()
class FakeReminders extends ReminderCancellationPort {
    public cancelForLink(linkId: string): Promise<number> {
        canceled.push(linkId);
        return Promise.resolve(1);
    }
}

@Module({ providers: [FakeReminders] })
class FakeRemindersModule {}

interface IssuedBody {
    readonly code: string;
    readonly waLink: string;
    readonly expiresAt: string;
}

interface ViewBody {
    readonly status: string;
    readonly phone: string | null;
    readonly veraNumber: string | null;
    readonly pending: { readonly expiresAt: string } | null;
    readonly lastUnlinkReason: string | null;
    readonly consentRequired: boolean;
}

interface ProblemBody {
    readonly type: string;
}

interface LinkRow {
    readonly status: string;
    readonly unlinkReason: string | null;
    readonly phoneHash: string;
    readonly phoneSealed: unknown;
    readonly phoneLast4: string;
    readonly optInSource: string;
    readonly companyId: string;
    readonly userId: string;
}

const HEADERS: Record<string, string> = { 'content-type': 'application/json' };
const PHONE_ID: string = '104857600000099';
const APP_SECRET: string = 'hosted-app-secret-1a2b3c4d';
const VERA_NUMBER: string = '551140000000';
const PHONE_1: string = '5511999990001';
const PHONE_2: string = '5511999990002';
const PHONE_3: string = '5511999990003';
const PHONE_4: string = '5511999990004';
const PHONE_5: string = '5511999990005';
const STRANGER: string = '5511999990077';
const HOSTED_ENV: Record<string, string> = {
    DEPLOYMENT_MODE: 'hosted',
    WHATSAPP_ACCESS_TOKEN: 'hosted-token-1a2b3c4d5e6f',
    WHATSAPP_PHONE_NUMBER_ID: PHONE_ID,
    WHATSAPP_VERIFY_TOKEN: 'hosted-verify-1a2b3c4d',
    WHATSAPP_APP_SECRET: APP_SECRET,
    WHATSAPP_WABA_ID: '200000000000099',
    WHATSAPP_DISPLAY_NUMBER: '+55 11 4000-0000'
};

function nowSeconds(): string {
    return String(Math.floor(Date.now() / 1000));
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

describe('whatsapp link (hospedada, driver mock)', () => {
    const publisher: CapturingPublisher = new CapturingPublisher();
    const signer: SignatureVerifier = new SignatureVerifier();
    let harness: AllocationHarness;
    let outbox: MockOutbox;
    let cursor: number = 0;
    let counter: number = 0;
    let alice: Account;
    let member: Account;
    let usedCode: string = '';

    async function inWorker<T>(fn: () => Promise<T>): Promise<T> {
        return harness.app.get(AppContext).run({ requestId: 'int-test', locale: 'pt-BR' }, fn);
    }

    async function companyOfMessage(messageId: string): Promise<string> {
        const rows = await harness.pg.query<{ companyId: string }>('SELECT "companyId" FROM "WhatsAppMessages" WHERE "id" = $1', [
            messageId
        ]);
        return rows.rows[0]?.companyId ?? '';
    }

    async function drain(): Promise<void> {
        while (cursor < publisher.published.length) {
            const message: PublishedMessage = publisher.published[cursor] as PublishedMessage;
            cursor += 1;
            await run(message);
        }
    }

    async function run(message: PublishedMessage): Promise<void> {
        const envelope: QueueEnvelope = envelopeOf(message);
        if (message.type === 'whatsapp.webhook.received') {
            await inWorker(async () => harness.app.get(WebhookReceivedHandler, { strict: false }).handle(envelope));
        }
        if (message.type === 'whatsapp.inbound.received') {
            await inWorker(async () => harness.app.get(InboundMessageHandler, { strict: false }).handle(envelope));
        }
        if (message.type === 'whatsapp.send.requested') {
            const companyId: string = await companyOfMessage((message.payload as { messageId: string }).messageId);
            await harness.inCompany(companyId, async () => harness.app.get(MessageSendHandler, { strict: false }).handle(envelope));
        }
    }

    async function deliver(from: string, text: string): Promise<void> {
        counter += 1;
        const raw: string = messageBody(PHONE_ID, from, `wamid.link.${String(counter)}`, text);
        const response = await harness.callText(
            'POST',
            '/whatsapp/webhook',
            { ...HEADERS, 'x-hub-signature-256': signer.sign(raw, APP_SECRET) },
            raw
        );
        expect(response.status).toBe(200);
        await drain();
    }

    function sentTo(phone: string): MockSentMessage[] {
        return outbox.list().filter((entry: MockSentMessage): boolean => entry.to === phone);
    }

    async function premium(account: Account): Promise<Account> {
        const contracts: PlanContractService = harness.app.get(PlanContractService, { strict: false });
        await harness.inCompany(account.company.id, async () => {
            await contracts.open('premium', { startsAt: new Date(), subscriptionId: crypto.randomUUID() });
        });
        return account;
    }

    async function addMember(account: Account, role: 'viewer' | 'editor'): Promise<Account> {
        const users: UserDomain = harness.app.get(UserDomain, { strict: false });
        const issuer: SessionIssuerPort = harness.app.get(SessionIssuerPort, { strict: false });
        const user: User = await harness.inCompany(account.company.id, async () =>
            users.createMember({
                email: `member-${crypto.randomUUID()}@example.com`,
                name: 'Pessoa membro',
                role,
                emailVerifiedAt: new Date(),
                termsAcceptedAt: new Date()
            })
        );
        const tokens: AuthTokens = await harness.inCompany(account.company.id, async () =>
            issuer.issueForNewLogin(user, { ip: '203.0.113.9', userAgent: 'int-test' }, 'google')
        );
        return { company: account.company, user, token: tokens.accessToken };
    }

    async function issue(account: Account, body: Record<string, unknown> = { consent: true }): Promise<IssuedBody> {
        const response = await harness.call<IssuedBody>(account.token, 'POST', '/whatsapp/link/code', body);
        expect(response.status).toBe(200);
        return response.body;
    }

    async function linkRows(account: Account): Promise<LinkRow[]> {
        const rows = await harness.pg.query<LinkRow>(
            'SELECT "status","unlinkReason","phoneHash","phoneSealed","phoneLast4","optInSource","companyId","userId" FROM "WhatsAppLinks" WHERE "userId" = $1 ORDER BY "createdAt"',
            [account.user.id]
        );
        return rows.rows;
    }

    async function view(account: Account): Promise<ViewBody> {
        return (await harness.call<ViewBody>(account.token, 'GET', '/whatsapp/link')).body;
    }

    async function linked(account: Account, phone: string): Promise<void> {
        const issued: IssuedBody = await issue(account);
        await deliver(phone, `VINCULAR ${issued.code}`);
        expect((await linkRows(account)).at(-1)?.status).toBe('active');
    }

    beforeAll(async () => {
        Object.assign(process.env, HOSTED_ENV);
        harness = await AllocationHarness.start('whatsapp_link_hosted', publisher, [FakeRemindersModule]);
        outbox = harness.app.get(MockOutbox, { strict: false });
        alice = await premium(await harness.signUp('link-alice'));
        member = await addMember(alice, 'viewer');
    });

    afterAll(async () => {
        for (const key of Object.keys(HOSTED_ENV)) {
            Reflect.deleteProperty(process.env, key);
        }
        await harness.stop();
    });

    it('Free recebe 402 e o GET mostra que ainda não há vínculo', async () => {
        const free: Account = await harness.signUp('link-free');

        const response = await harness.call<ProblemBody>(free.token, 'POST', '/whatsapp/link/code', { consent: true });

        expect(response.status).toBe(402);
        expect(response.body.type).toBe('billing.premium_required');
        expect(await view(free)).toMatchObject({
            status: 'none',
            phone: null,
            pending: null,
            lastUnlinkReason: null,
            veraNumber: VERA_NUMBER
        });
    });

    it('sem permissão de envio e sem consent responde 422; com consent grava a permissão e devolve o link wa.me sem enviar nada', async () => {
        expect(await view(alice)).toMatchObject({ consentRequired: true });

        const refused = await harness.call<ProblemBody>(alice.token, 'POST', '/whatsapp/link/code', {});
        expect(refused.status).toBe(422);
        expect(refused.body.type).toBe('whatsapp.consent_required');

        const issued: IssuedBody = await issue(alice, { consent: true });

        expect(issued.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
        expect(issued.waLink).toBe(`https://wa.me/${VERA_NUMBER}?text=VINCULAR%20${issued.code}`);
        expect(new Date(issued.expiresAt).getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
        expect(new Date(issued.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + 10 * 60_000);
        expect(outbox.list()).toHaveLength(0);
        const consent = await harness.call<{ granted: boolean; source: string }>(alice.token, 'GET', '/ai/consent');
        expect(consent.body).toMatchObject({ granted: true, source: 'whatsapp_link' });
        const stored = await harness.pg.query<{ codeHash: string }>('SELECT "codeHash" FROM "WhatsAppLinkCodes" WHERE "userId" = $1', [
            alice.user.id
        ]);
        expect(stored.rows).toHaveLength(1);
        expect(stored.rows[0]?.codeHash).not.toContain(issued.code);
        expect(await view(alice)).toMatchObject({ status: 'pending', consentRequired: false, pending: { expiresAt: issued.expiresAt } });
    });

    it('um código novo cancela o anterior ainda não usado', async () => {
        const first: IssuedBody = (await harness.call<IssuedBody>(alice.token, 'POST', '/whatsapp/link/code', {})).body;
        const second: IssuedBody = await issue(alice, {});

        await deliver(STRANGER, `VINCULAR ${first.code}`);

        expect(await linkRows(alice)).toHaveLength(0);
        expect(sentTo(STRANGER).map((entry: MockSentMessage) => entry.body)).toEqual([linkTextsFor('pt-BR').invalidCode]);
        usedCode = second.code;
        await deliver(PHONE_1, `vincular  ${second.code.toLowerCase()}.`);
        expect(await linkRows(alice)).toHaveLength(1);
    });

    it('"VINCULAR <código>" vincula o wa_id de quem mandou, grava o opt-in e responde as boas-vindas como texto grátis', async () => {
        const rows: LinkRow[] = await linkRows(alice);

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ status: 'active', optInSource: 'user_message', phoneLast4: '0001', companyId: alice.company.id });
        expect(JSON.stringify(rows[0])).not.toContain(PHONE_1);
        expect(rows[0]?.phoneHash).toMatch(/^[0-9a-f]{64}$/);
        const used = await harness.pg.query('SELECT 1 FROM "WhatsAppLinkCodes" WHERE "userId" = $1 AND "usedAt" IS NOT NULL', [
            alice.user.id
        ]);
        expect(used.rowCount).toBe(1);
        expect(sentTo(PHONE_1)).toMatchObject([{ kind: 'text', body: expect.stringContaining('Número confirmado') }]);
        expect(outbox.list().some((entry: MockSentMessage): boolean => entry.kind === 'template')).toBe(false);
        const messages = await harness.pg.query<{ direction: string; kind: string; body: string | null; linkId: string | null }>(
            'SELECT "direction","kind","body","linkId" FROM "WhatsAppMessages" WHERE "companyId" = $1 ORDER BY "createdAt","id"',
            [alice.company.id]
        );
        expect(messages.rows.map((row) => [row.direction, row.kind])).toEqual([
            ['in', 'text'],
            ['out', 'text']
        ]);
        expect(messages.rows[0]).toMatchObject({ body: 'VINCULAR', linkId: expect.any(String) });
        expect(JSON.stringify(messages.rows)).not.toMatch(/VINCULAR [A-Z0-9]{8}/);
        expect(await view(alice)).toMatchObject({ status: 'active', phone: `+${PHONE_1}`, veraNumber: VERA_NUMBER, pending: null });
    });

    it('com vínculo ativo, pedir outro código responde 409', async () => {
        const response = await harness.call<ProblemBody>(alice.token, 'POST', '/whatsapp/link/code', {});

        expect(response.status).toBe(409);
        expect(response.body.type).toBe('whatsapp.already_linked');
    });

    it('código já usado, vencido e inexistente recebem a mesma resposta; a sexta fica calada até a hora virar', async () => {
        const invalid: string = linkTextsFor('pt-BR').invalidCode;
        const owner: Account = await premium(await harness.signUp('link-expired'));
        const expired: IssuedBody = await issue(owner);
        await harness.pg.query(`UPDATE "WhatsAppLinkCodes" SET "expiresAt" = now() - interval '1 minute' WHERE "userId" = $1`, [
            owner.user.id
        ]);

        await deliver(PHONE_3, `VINCULAR ${expired.code}`);
        await deliver(PHONE_3, `VINCULAR ${usedCode}`);
        await deliver(PHONE_3, 'VINCULAR ZZZZZZZ9');

        expect(sentTo(PHONE_3).map((entry: MockSentMessage) => entry.body)).toEqual([invalid, invalid, invalid]);
        for (const attempt of ['VINCULAR BBBBBBB2', 'VINCULAR CCCCCCC2', 'VINCULAR DDDDDDD2', 'VINCULAR EEEEEEE2']) {
            await deliver(PHONE_3, attempt);
        }
        expect(sentTo(PHONE_3)).toHaveLength(5);
        expect(await linkRows(owner)).toHaveLength(0);
    });

    it('número já ativo em outra pessoa recusa sem dizer qual e deixa o código usado', async () => {
        const bob: Account = await premium(await harness.signUp('link-bob'));
        const issued: IssuedBody = await issue(bob);

        await deliver(PHONE_1, `VINCULAR ${issued.code}`);

        expect(await linkRows(bob)).toHaveLength(0);
        expect(sentTo(PHONE_1).at(-1)?.body).toBe(linkTextsFor('pt-BR').phoneInUse);
        const code = await harness.pg.query('SELECT 1 FROM "WhatsAppLinkCodes" WHERE "userId" = $1 AND "usedAt" IS NOT NULL', [
            bob.user.id
        ]);
        expect(code.rowCount).toBe(1);
    });

    it('o sexto código na hora responde 429', async () => {
        const dan: Account = await premium(await harness.signUp('link-dan'));

        for (let attempt: number = 0; attempt < 5; attempt += 1) {
            await issue(dan);
        }
        const sixth = await harness.call<ProblemBody>(dan.token, 'POST', '/whatsapp/link/code', {});

        expect(sixth.status).toBe(429);
        expect(sixth.body.type).toBe('core.too_many_attempts');
    });

    it('Leitura também vincula o próprio número; cada pessoa tem o seu', async () => {
        await linked(member, PHONE_2);

        expect(await view(member)).toMatchObject({ status: 'active', phone: `+${PHONE_2}` });
        expect(await view(alice)).toMatchObject({ phone: `+${PHONE_1}` });
    });

    it('o resolvedor devolve pessoa e conta pelo número, atualiza lastInboundAt e nunca a company errada', async () => {
        const resolver: LinkResolverService = harness.app.get(LinkResolverService, { strict: false });
        const channel = await inWorker(async () => harness.app.get(WhatsAppChannelService, { strict: false }).current());
        const other: Account = await premium(await harness.signUp('link-other'));
        await linked(other, PHONE_4);
        await harness.pg.query(`UPDATE "WhatsAppLinks" SET "lastInboundAt" = now() - interval '3 days' WHERE "userId" = $1`, [
            alice.user.id
        ]);

        const first = await inWorker(async () => resolver.resolve(PHONE_1, channel as never));
        const second = await inWorker(async () => resolver.resolve(PHONE_4, channel as never));
        const nobody = await inWorker(async () => resolver.resolve(STRANGER, channel as never));

        expect(first).toMatchObject({ companyId: alice.company.id, userId: alice.user.id, locale: 'pt-BR' });
        expect(second).toMatchObject({ companyId: other.company.id, userId: other.user.id });
        expect(nobody).toBeNull();
        const touched = await harness.pg.query<{ fresh: boolean }>(
            `SELECT "lastInboundAt" > now() - interval '1 minute' AS "fresh" FROM "WhatsAppLinks" WHERE "userId" = $1`,
            [alice.user.id]
        );
        expect(touched.rows[0]?.fresh).toBe(true);
    });

    it('desvincular pelo app cancela os lembretes, apaga o texto da conversa e é idempotente', async () => {
        const rows: LinkRow[] = await linkRows(member);
        const before: number = canceled.length;

        const first = await harness.call<null>(member.token, 'DELETE', '/whatsapp/link');
        const again = await harness.call<null>(member.token, 'DELETE', '/whatsapp/link');

        expect([first.status, again.status]).toEqual([204, 204]);
        expect(canceled).toHaveLength(before + 1);
        expect((await linkRows(member))[0]).toMatchObject({ status: 'unlinked', unlinkReason: 'user_app' });
        expect(rows[0]?.status).toBe('active');
        const texts = await harness.pg.query(
            'SELECT 1 FROM "WhatsAppMessages" WHERE "companyId" = $1 AND "peer" = $2 AND "body" IS NOT NULL',
            [member.company.id, PHONE_2]
        );
        expect(texts.rowCount).toBe(0);
        expect(await view(member)).toMatchObject({ status: 'none', phone: null, lastUnlinkReason: 'user_app' });
    });

    it('"sair" pela conversa desvincula, responde uma última vez e "sair" de quem não tem vínculo não responde nada', async () => {
        const person: Account = await addMember(alice, 'editor');
        await linked(person, PHONE_2);
        const before: number = sentTo(PHONE_2).length;

        await deliver(PHONE_2, 'Sair.');

        expect((await linkRows(person)).at(-1)).toMatchObject({ status: 'unlinked', unlinkReason: 'user_chat' });
        expect(
            sentTo(PHONE_2)
                .slice(before)
                .map((entry: MockSentMessage) => entry.body)
        ).toEqual([linkTextsFor('pt-BR').unlinked]);
        await deliver(PHONE_2, 'parar');
        await deliver(PHONE_5, 'stop');
        expect(sentTo(PHONE_2)).toHaveLength(before + 1);
        expect(sentTo(PHONE_5)).toHaveLength(0);
        expect(await view(person)).toMatchObject({ lastUnlinkReason: 'user_chat' });
    });

    it('"parar" registra o motivo opt_out', async () => {
        const person: Account = await addMember(alice, 'viewer');
        await linked(person, PHONE_2);

        await deliver(PHONE_2, 'parar');

        expect((await linkRows(person)).at(-1)).toMatchObject({ status: 'unlinked', unlinkReason: 'opt_out' });
    });

    it('membro removido desvincula só o número dele', async () => {
        const person: Account = await addMember(alice, 'viewer');
        await linked(person, PHONE_2);
        const lifecycle: WhatsAppMemberLifecycle = harness.app.get(WhatsAppMemberLifecycle, { strict: false });

        await harness.inCompany(alice.company.id, async () => lifecycle.onMemberRemoved(person.user.id));

        expect((await linkRows(person)).at(-1)).toMatchObject({ status: 'unlinked', unlinkReason: 'member_removed' });
        expect((await linkRows(alice)).at(-1)).toMatchObject({ status: 'active' });
    });

    it('vínculo sem mensagem há 181 dias vira stale pelo comando, sem mensagem no WhatsApp', async () => {
        const person: Account = await addMember(alice, 'viewer');
        await linked(person, PHONE_2);
        const sent: number = outbox.list().length;
        await harness.pg.query(
            `UPDATE "WhatsAppLinks" SET "lastInboundAt" = now() - interval '181 days' WHERE "userId" = $1 AND "status" = 'active'`,
            [person.user.id]
        );
        const tick: PublishedMessage = { queue: 'vera-whatsapp', type: 'whatsapp.links.stale.requested', payload: {} };

        await inWorker(async () => harness.app.get(WhatsAppLinksStaleTickHandler, { strict: false }).handle(envelopeOf(tick)));

        expect((await linkRows(person)).at(-1)).toMatchObject({ status: 'unlinked', unlinkReason: 'stale' });
        expect((await linkRows(alice)).at(-1)).toMatchObject({ status: 'active' });
        expect(outbox.list()).toHaveLength(sent);
        expect(await view(person)).toMatchObject({ lastUnlinkReason: 'stale' });
    });

    it('exporta o vínculo sem o número em claro', async () => {
        const registry: AccountDataRegistry = harness.app.get(AccountDataRegistry, { strict: false });

        const sections = await harness.inCompany(alice.company.id, async () => registry.exportSections(alice.company.id));

        const exported: string = JSON.stringify(sections['whatsapp_links']);
        expect(exported).toContain('"phoneLast4":"0001"');
        expect(exported).not.toContain(PHONE_1);
        expect(exported).not.toMatch(/[0-9a-f]{64}/);
    });

    it('fim do Premium desvincula todos os vínculos da conta, sem mensagem', async () => {
        const person: Account = await addMember(alice, 'viewer');
        await linked(person, PHONE_2);
        const sent: number = outbox.list().length;
        const contracts: PlanContractService = harness.app.get(PlanContractService, { strict: false });

        await harness.inCompany(alice.company.id, async () => contracts.close('premium', { endsAt: new Date(), reason: 'canceled' }));

        expect((await linkRows(alice)).at(-1)).toMatchObject({ status: 'unlinked', unlinkReason: 'premium_ended' });
        expect((await linkRows(person)).at(-1)).toMatchObject({ status: 'unlinked', unlinkReason: 'premium_ended' });
        expect(outbox.list()).toHaveLength(sent);
        expect(await view(alice)).toMatchObject({ status: 'none', lastUnlinkReason: 'premium_ended' });
    });

    it('o apagador remove vínculos e códigos da company', async () => {
        const registry: AccountDataRegistry = harness.app.get(AccountDataRegistry, { strict: false });

        const erased = await harness.inCompany(alice.company.id, async () => registry.eraseAll(alice.company.id));

        expect(erased).toContainEqual({ area: 'whatsapp_links', erased: expect.any(Number) });
        const left = await harness.pg.query('SELECT 1 FROM "WhatsAppLinks" WHERE "companyId" = $1', [alice.company.id]);
        expect(left.rowCount).toBe(0);
    });
});

const GOOD_KEY: string = 'sentinel-key-7c1d2e3f4a5b';
const GOOD_TOKEN: string = 'sentinel-token-9a8b7c6d5e4f';
const SELF_PHONE_A: string = '104857600000001';
const SELF_PHONE_B: string = '104857600000002';
const SELF_SECRET_A: string = 'app-secret-alice-1a2b3c4d5e';
const SELF_SECRET_B: string = 'app-secret-bob-9z8y7x6w5v';

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
    answer(response, authorization === `Bearer ${GOOD_TOKEN}` ? 200 : 401, { verified_name: 'Loja' });
}

function listen(server: Server): Promise<number> {
    return new Promise((resolve: (port: number) => void): void => {
        server.listen(0, '127.0.0.1', (): void => {
            resolve((server.address() as AddressInfo).port);
        });
    });
}

describe('whatsapp link (auto-hospedada, driver mock)', () => {
    const publisher: CapturingPublisher = new CapturingPublisher();
    const signer: SignatureVerifier = new SignatureVerifier();
    let harness: AllocationHarness;
    let server: Server;
    let alice: Account;
    let bob: Account;
    let cursor: number = 0;
    let counter: number = 0;

    async function inWorker<T>(fn: () => Promise<T>): Promise<T> {
        return harness.app.get(AppContext).run({ requestId: 'int-test', locale: 'pt-BR' }, fn);
    }

    async function deliver(phoneId: string, secret: string, from: string, text: string): Promise<void> {
        counter += 1;
        const raw: string = messageBody(phoneId, from, `wamid.self.${String(counter)}`, text);
        const response = await harness.callText(
            'POST',
            '/whatsapp/webhook',
            { ...HEADERS, 'x-hub-signature-256': signer.sign(raw, secret) },
            raw
        );
        expect(response.status).toBe(200);
        while (cursor < publisher.published.length) {
            const message: PublishedMessage = publisher.published[cursor] as PublishedMessage;
            cursor += 1;
            await dispatch(message);
        }
    }

    async function dispatch(message: PublishedMessage): Promise<void> {
        const envelope: QueueEnvelope = envelopeOf(message);
        if (message.type === 'whatsapp.webhook.received') {
            await inWorker(async () => harness.app.get(WebhookReceivedHandler, { strict: false }).handle(envelope));
        }
        if (message.type === 'whatsapp.inbound.received') {
            await inWorker(async () => harness.app.get(InboundMessageHandler, { strict: false }).handle(envelope));
        }
    }

    beforeAll(async () => {
        server = createServer(provider);
        const base: string = `http://127.0.0.1:${String(await listen(server))}`;
        process.env['DEPLOYMENT_MODE'] = 'self_hosted';
        process.env['WHATSAPP_GRAPH_URL'] = base;
        harness = await AllocationHarness.start('whatsapp_link_self', publisher);
        alice = await harness.signUp('link-self-alice');
        bob = await harness.signUp('link-self-bob');
        for (const account of [alice, bob]) {
            await harness.call(account.token, 'PUT', '/integrations/llm', { baseUrl: base, apiKey: GOOD_KEY, model: 'model-a' });
        }
        for (const [account, phone, secret, verify] of [
            [alice, SELF_PHONE_A, SELF_SECRET_A, 'verify-token-alice-1a2b3c'],
            [bob, SELF_PHONE_B, SELF_SECRET_B, 'verify-token-bob-9z8y7x']
        ] as const) {
            const saved = await harness.call(account.token, 'PUT', '/integrations/whatsapp', {
                accessToken: GOOD_TOKEN,
                phoneNumberId: phone,
                verifyToken: verify,
                appSecret: secret,
                wabaId: phone
            });
            expect(saved.status).toBe(200);
        }
    });

    afterAll(async () => {
        delete process.env['DEPLOYMENT_MODE'];
        delete process.env['WHATSAPP_GRAPH_URL'];
        await harness.stop();
        server.close();
    });

    it('usa o número de exibição do canal da company no link wa.me', async () => {
        const response = await harness.call<IssuedBody>(alice.token, 'POST', '/whatsapp/link/code', { consent: true });

        expect(response.status).toBe(200);
        expect(response.body.waLink).toBe(`https://wa.me/551140000000?text=VINCULAR%20${response.body.code}`);
    });

    it('código de A mandado para o canal de B não vincula; para o canal certo vincula', async () => {
        const issued = (await harness.call<IssuedBody>(alice.token, 'POST', '/whatsapp/link/code', { consent: true })).body;

        await deliver(SELF_PHONE_B, SELF_SECRET_B, PHONE_1, `VINCULAR ${issued.code}`);
        expect((await harness.pg.query('SELECT 1 FROM "WhatsAppLinks"')).rowCount).toBe(0);

        await deliver(SELF_PHONE_A, SELF_SECRET_A, PHONE_1, `VINCULAR ${issued.code}`);
        const rows = await harness.pg.query<{ companyId: string; status: string }>('SELECT "companyId","status" FROM "WhatsAppLinks"');
        expect(rows.rows).toEqual([{ companyId: alice.company.id, status: 'active' }]);
    });

    it('remover a chave do WhatsApp suspende o vínculo; com a chave de volta, uma mensagem do número reativa', async () => {
        const removed = await harness.call(alice.token, 'DELETE', '/integrations/whatsapp');
        expect(removed.status).toBe(204);
        const suspended = await harness.pg.query<{ status: string }>('SELECT "status" FROM "WhatsAppLinks" WHERE "companyId" = $1', [
            alice.company.id
        ]);
        expect(suspended.rows).toEqual([{ status: 'suspended' }]);
        expect((await harness.call(alice.token, 'GET', '/whatsapp/link')).status).toBe(503);

        const restored = await harness.call(alice.token, 'PUT', '/integrations/whatsapp', {
            accessToken: GOOD_TOKEN,
            phoneNumberId: SELF_PHONE_A,
            verifyToken: 'verify-token-alice-1a2b3c',
            appSecret: SELF_SECRET_A,
            wabaId: SELF_PHONE_A
        });
        expect(restored.status).toBe(200);
        const channel = await inWorker(async () =>
            harness.app.get(WhatsAppChannelService, { strict: false }).byPhoneNumberId(SELF_PHONE_A)
        );
        const sender = await inWorker(async () =>
            harness.app.get(LinkResolverService, { strict: false }).resolve(PHONE_1, channel as never)
        );

        expect(sender).toMatchObject({ companyId: alice.company.id, userId: alice.user.id });
        const active = await harness.pg.query<{ status: string }>('SELECT "status" FROM "WhatsAppLinks" WHERE "companyId" = $1', [
            alice.company.id
        ]);
        expect(active.rows).toEqual([{ status: 'active' }]);
    });

    it('sem a chave do WhatsApp o pedido de código responde 503', async () => {
        await harness.call(bob.token, 'DELETE', '/integrations/whatsapp');

        const refused = await harness.call<ProblemBody>(bob.token, 'POST', '/whatsapp/link/code', { consent: true });

        expect(refused.status).toBe(503);
    });
});
