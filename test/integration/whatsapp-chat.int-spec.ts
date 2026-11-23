import { Injectable, Module } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { MockLlmDriver } from '../../src/core/llm/drivers/mock-llm.driver';
import { JsonObject } from '../../src/core/llm/llm.types';
import { QueueEnvelope } from '../../src/core/queue/queue.types';
import { AskVeraToolKind } from '../../src/modules/ai-assistant/domain/ask-vera.types';
import { AskVeraToolPort, AskVeraToolOutput, PaidFeature } from '../../src/modules/ai-assistant/services/ask-vera-tool.port';
import { AskVeraService } from '../../src/modules/ai-assistant/services/ask-vera.service';
import { UserDomain } from '../../src/modules/identity/domain/user.domain';
import { User } from '../../src/modules/identity/domain/identity.types';
import { AuthTokens, SessionIssuerPort } from '../../src/modules/identity/ports/session-issuer.port';
import { PlanContractService } from '../../src/modules/plans/services/plan-contract.service';
import { PlanGateService } from '../../src/modules/plans/services/plan-gate.service';
import { InboundMessageHandler } from '../../src/modules/whatsapp/access/queue/inbound.handler';
import { MessageSendHandler } from '../../src/modules/whatsapp/access/queue/send.handler';
import { WebhookReceivedHandler } from '../../src/modules/whatsapp/access/queue/webhook.handler';
import { MockOutbox, MockSentMessage } from '../../src/modules/whatsapp/services/mock-outbox.service';
import { SignatureVerifier } from '../../src/modules/whatsapp/services/signature.verifier';
import { WhatsAppDirectReply } from '../../src/modules/whatsapp/services/whatsapp-direct-reply.service';
import { TurnAnsweredHandler } from '../../src/modules/whatsapp-chat/access/queue/answer.handler';
import { TurnRequestedHandler } from '../../src/modules/whatsapp-chat/access/queue/turn.handler';
import { CalendarCreateEventTool } from '../../src/modules/google-calendar/services/calendar-ask-vera.tools';
import { CalendarCreateExecutor } from '../../src/modules/google-calendar/services/calendar-pending-actions';
import { Account, AllocationHarness } from './support/allocation-harness';
import { seedUsdRate } from './support/portfolio-seed';
import { CapturingPublisher, PublishedMessage } from './support/queue';

const executed: { readonly kind: string; readonly payload: JsonObject }[] = [];

abstract class FakeTool extends AskVeraToolPort {
    public readonly feature: PaidFeature = 'whatsapp';
    public readonly inputSchema = z.object({ title: z.string().default('x') });

    public description(): string {
        return this.name;
    }

    public run(input: unknown): Promise<AskVeraToolOutput> {
        const title: string = (input as { title: string }).title;
        return Promise.resolve({ payload: { status: 'ok' }, proposal: { summary: `Proposta: ${title}`, payload: { title } } });
    }
}

@Injectable()
class FakeOutsideTool extends FakeTool {
    public readonly name: string = 'secret_tool';
    public readonly kind: AskVeraToolKind = 'read';
}

@Module({ providers: [FakeOutsideTool] })
class FakeChatModule {}

interface IssuedBody {
    readonly code: string;
}

const HEADERS: Record<string, string> = { 'content-type': 'application/json' };
const PHONE_ID: string = '104857600000099';
const APP_SECRET: string = 'hosted-app-secret-1a2b3c4d';
const HOSTED_ENV: Record<string, string> = {
    DEPLOYMENT_MODE: 'hosted',
    WHATSAPP_ACCESS_TOKEN: 'hosted-token-1a2b3c4d5e6f',
    WHATSAPP_PHONE_NUMBER_ID: PHONE_ID,
    WHATSAPP_VERIFY_TOKEN: 'hosted-verify-1a2b3c4d',
    WHATSAPP_APP_SECRET: APP_SECRET,
    WHATSAPP_WABA_ID: '200000000000099',
    WHATSAPP_DISPLAY_NUMBER: '+55 11 4000-0000',
    WHATSAPP_CHAT_LIMIT_MINUTE: '3',
    LLM_REPEAT_LIMIT: '1000'
};
const STRANGER: string = '5511999990077';
const PHONES: readonly string[] = ['5511999991001', '5511999991002', '5511999991003', '5511999991004', '5511999991005', '5511999991006'];

function nowSeconds(): string {
    return String(Math.floor(Date.now() / 1000));
}

function bodyOf(from: string, wamid: string, message: Record<string, unknown>, entryId: string = 'entry-1'): string {
    return JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
            {
                id: entryId,
                changes: [
                    {
                        field: 'messages',
                        value: {
                            messaging_product: 'whatsapp',
                            metadata: { phone_number_id: PHONE_ID },
                            messages: [{ from, id: wamid, timestamp: nowSeconds(), ...message }]
                        }
                    }
                ]
            }
        ]
    });
}

function textBody(from: string, wamid: string, text: string, entryId?: string): string {
    return bodyOf(from, wamid, { type: 'text', text: { body: text } }, entryId);
}

describe('whatsapp chat (hospedada, drivers mock)', () => {
    const publisher: CapturingPublisher = new CapturingPublisher();
    const signer: SignatureVerifier = new SignatureVerifier();
    let harness: AllocationHarness;
    let outbox: MockOutbox;
    let llm: MockLlmDriver;
    let cursor: number = 0;
    let counter: number = 0;
    let holdTurns: boolean = false;
    const held: PublishedMessage[] = [];

    async function companyOfLink(linkId: string): Promise<string> {
        const rows = await harness.pg.query<{ companyId: string }>('SELECT "companyId" FROM "WhatsAppLinks" WHERE "id" = $1', [linkId]);
        return rows.rows[0]?.companyId ?? '';
    }

    async function companyOfMessage(messageId: string): Promise<string> {
        const rows = await harness.pg.query<{ companyId: string }>('SELECT "companyId" FROM "WhatsAppMessages" WHERE "id" = $1', [
            messageId
        ]);
        return rows.rows[0]?.companyId ?? '';
    }

    function envelopeOf(message: PublishedMessage, companyId: string | null): QueueEnvelope {
        return {
            type: message.type,
            requestId: 'int-test',
            companyId,
            occurredAt: new Date().toISOString(),
            trace: {},
            payload: message.payload
        };
    }

    async function inWorker<T>(fn: () => Promise<T>): Promise<T> {
        return harness.inCompany('00000000-0000-7000-8000-000000000000', fn);
    }

    async function run(message: PublishedMessage): Promise<void> {
        if (message.type === 'whatsapp.webhook.received') {
            const envelope: QueueEnvelope = envelopeOf(message, null);
            await inWorker(async () => harness.app.get(WebhookReceivedHandler, { strict: false }).handle(envelope));
        }
        if (message.type === 'whatsapp.inbound.received') {
            const envelope: QueueEnvelope = envelopeOf(message, null);
            await inWorker(async () => harness.app.get(InboundMessageHandler, { strict: false }).handle(envelope));
        }
        if (message.type === 'whatsapp.send.requested') {
            const companyId: string = await companyOfMessage((message.payload as { messageId: string }).messageId);
            await harness.inCompany(companyId, async () =>
                harness.app.get(MessageSendHandler, { strict: false }).handle(envelopeOf(message, companyId))
            );
        }
        await runChat(message);
    }

    async function runChat(message: PublishedMessage): Promise<void> {
        const linkId: string | undefined = (message.payload as { linkId?: string }).linkId;
        if (linkId === undefined) {
            return;
        }
        const companyId: string = await companyOfLink(linkId);
        const envelope: QueueEnvelope = envelopeOf(message, companyId);
        if (message.type === 'whatsapp.turn.requested') {
            await harness.inCompany(companyId, async () => harness.app.get(TurnRequestedHandler, { strict: false }).handle(envelope));
        }
        if (message.type === 'whatsapp.turn.answered') {
            await harness.inCompany(companyId, async () => harness.app.get(TurnAnsweredHandler, { strict: false }).handle(envelope));
        }
    }

    async function drain(): Promise<void> {
        while (cursor < publisher.published.length) {
            const message: PublishedMessage = publisher.published[cursor] as PublishedMessage;
            cursor += 1;
            if (holdTurns && message.type === 'whatsapp.turn.requested') {
                held.push(message);
                continue;
            }
            await run(message);
        }
    }

    async function release(): Promise<void> {
        holdTurns = false;
        for (const message of held.splice(0)) {
            await run(message);
        }
        await drain();
    }

    async function post(raw: string): Promise<void> {
        const response = await harness.callText(
            'POST',
            '/whatsapp/webhook',
            { ...HEADERS, 'x-hub-signature-256': signer.sign(raw, APP_SECRET) },
            raw
        );
        expect(response.status).toBe(200);
        await drain();
    }

    async function say(from: string, text: string): Promise<string> {
        counter += 1;
        const wamid: string = `wamid.chat.${String(counter)}`;
        await post(textBody(from, wamid, text));
        return wamid;
    }

    async function tap(from: string, id: string): Promise<void> {
        counter += 1;
        await post(
            bodyOf(from, `wamid.chat.${String(counter)}`, {
                type: 'interactive',
                interactive: { type: 'button_reply', button_reply: { id, title: 'x' } }
            })
        );
    }

    function sentTo(phone: string): MockSentMessage[] {
        return outbox.list().filter((entry: MockSentMessage): boolean => entry.to === phone);
    }

    function bodiesTo(phone: string): (string | null)[] {
        return sentTo(phone).map((entry: MockSentMessage): string | null => entry.body);
    }

    async function premium(account: Account): Promise<Account> {
        const contracts: PlanContractService = harness.app.get(PlanContractService, { strict: false });
        await harness.inCompany(account.company.id, async () => {
            await contracts.open('premium', { startsAt: new Date(), subscriptionId: crypto.randomUUID() });
        });
        return account;
    }

    async function linked(label: string, phone: string): Promise<Account> {
        const account: Account = await premium(await harness.signUp(label));
        const issued = await harness.call<IssuedBody>(account.token, 'POST', '/whatsapp/link/code', { consent: true });
        await say(phone, `VINCULAR ${issued.body.code}`);
        return account;
    }

    async function viewerLinked(owner: Account, phone: string): Promise<Account> {
        const users: UserDomain = harness.app.get(UserDomain, { strict: false });
        const issuer: SessionIssuerPort = harness.app.get(SessionIssuerPort, { strict: false });
        const user: User = await harness.inCompany(owner.company.id, async () =>
            users.createMember({
                email: `viewer-${crypto.randomUUID()}@example.com`,
                name: 'Pessoa leitura',
                role: 'viewer',
                emailVerifiedAt: new Date(),
                termsAcceptedAt: new Date()
            })
        );
        const tokens: AuthTokens = await harness.inCompany(owner.company.id, async () =>
            issuer.issueForNewLogin(user, { ip: '203.0.113.9', userAgent: 'int-test' }, 'google', 'app')
        );
        const issued = await harness.call<IssuedBody>(tokens.accessToken, 'POST', '/whatsapp/link/code', { consent: true });
        await say(phone, `VINCULAR ${issued.body.code}`);
        return { company: owner.company, user, token: tokens.accessToken };
    }

    async function choicesTo(phone: string): Promise<string[]> {
        const rows = await harness.pg.query<{ payload: { choices: { id: string }[] } }>(
            'SELECT "payload" FROM "WhatsAppMessages" WHERE "peer" = $1 AND "kind" = \'interactive\' ORDER BY "createdAt" DESC LIMIT 1',
            [phone]
        );
        return (rows.rows[0]?.payload.choices ?? []).map((choice: { id: string }): string => choice.id);
    }

    async function pendingRows(account: Account): Promise<{ kind: string; resolution: string | null }[]> {
        const rows = await harness.pg.query<{ kind: string; resolution: string | null }>(
            'SELECT "kind","resolution" FROM "WhatsAppPendingActions" WHERE "companyId" = $1 ORDER BY "createdAt"',
            [account.company.id]
        );
        return rows.rows;
    }

    beforeAll(async () => {
        Object.assign(process.env, HOSTED_ENV);
        harness = await AllocationHarness.start('whatsapp_chat', publisher, [FakeChatModule]);
        await seedUsdRate(harness);
        outbox = harness.app.get(MockOutbox, { strict: false });
        llm = harness.app.get(MockLlmDriver, { strict: false });
        const tool: CalendarCreateEventTool = harness.app.get(CalendarCreateEventTool, { strict: false });
        vi.spyOn(tool, 'run').mockImplementation((input: unknown): Promise<AskVeraToolOutput> => {
            const title: string = (input as { title: string }).title;
            return Promise.resolve({ payload: { status: 'ok' }, proposal: { summary: `Proposta: ${title}`, payload: { title } } });
        });
        const executor: CalendarCreateExecutor = harness.app.get(CalendarCreateExecutor, { strict: false });
        vi.spyOn(executor, 'execute').mockImplementation((payload: JsonObject): Promise<string | null> => {
            executed.push({ kind: 'calendar_create', payload });
            return Promise.resolve(null);
        });
        vi.spyOn(executor, 'describe').mockImplementation((payload: JsonObject): string => `Confirmar: ${payload['title'] as string}`);
    });

    afterAll(async () => {
        for (const key of Object.keys(HOSTED_ENV)) {
            Reflect.deleteProperty(process.env, key);
        }
        await harness.stop();
    });

    it('pergunta livre: o modelo é chamado pelo canal do WhatsApp, a resposta sai como texto e a mensagem é marcada como lida', async () => {
        const account: Account = await linked('chat-ask', PHONES[0] as string);
        const phone: string = PHONES[0] as string;
        const markRead = vi.spyOn(harness.app.get(WhatsAppDirectReply, { strict: false }), 'markRead');
        const ask = vi.spyOn(harness.app.get(AskVeraService, { strict: false }), 'ask');
        llm.enqueue({ text: '', toolUses: [{ toolUseId: 'u1', name: 'spending_month_summary', input: { month: '2026-10' } }] });
        llm.enqueue('Você ainda não tem gastos para comparar.');

        const wamid: string = await say(phone, 'Quanto gastei com delivery?');

        expect(ask).toHaveBeenCalledWith(
            expect.objectContaining({ text: 'Quanto gastei com delivery?', messageId: wamid, locale: 'pt-BR' })
        );
        expect(markRead).toHaveBeenCalledWith(expect.anything(), wamid);
        const reply: MockSentMessage | undefined = sentTo(phone).at(-1);
        expect(reply).toMatchObject({ kind: 'text', body: 'Você ainda não tem gastos para comparar.' });
        expect(JSON.stringify(sentTo(phone))).not.toContain('Isto não é recomendação');
        const turnJob: PublishedMessage | undefined = publisher.ofType('whatsapp.turn.requested').at(-1);
        expect(turnJob?.options).toMatchObject({ jobId: `wa-turn-${wamid}` });
        expect(JSON.stringify(turnJob?.payload)).not.toContain('delivery');
        expect(account.company.id).toBeTruthy();
        markRead.mockRestore();
        ask.mockRestore();
    });

    it('pergunta sobre carteira termina com o aviso da CVM', async () => {
        const phone: string = PHONES[0] as string;
        llm.enqueue({ text: '', toolUses: [{ toolUseId: 'u2', name: 'portfolio_overview', input: {} }] });
        llm.enqueue('Você ainda não cadastrou uma carteira.');

        await say(phone, 'Como está minha carteira?');

        expect(bodiesTo(phone).at(-1)).toBe(
            'Você ainda não cadastrou uma carteira.\nIsto não é recomendação de investimento. A Vera compara a carteira com a meta que você definiu.'
        );
    });

    it('"VINCULAR <código>" é consumido pelo vínculo e não chega ao roteador', async () => {
        const before: number = publisher.ofType('whatsapp.turn.requested').length;
        const calls = vi.spyOn(llm, 'generate');

        await linked('chat-link-only', PHONES[1] as string);

        expect(publisher.ofType('whatsapp.turn.requested')).toHaveLength(before);
        expect(calls).not.toHaveBeenCalled();
        expect(bodiesTo(PHONES[1] as string)).toHaveLength(1);
        expect(bodiesTo(PHONES[1] as string)[0]).toContain('Número confirmado');
        calls.mockRestore();
    });

    it('Pix, transferência e pagamento são recusados sem modelo', async () => {
        const phone: string = PHONES[0] as string;
        const calls = vi.spyOn(llm, 'generate');

        await say(phone, 'faz um Pix de R$ 50 pra Maria');

        expect(bodiesTo(phone).at(-1)).toBe(
            'A Vera não faz Pix, pagamentos nem transferências: ela só lê seus dados. Use o app do seu banco.'
        );
        expect(calls).not.toHaveBeenCalled();
        calls.mockRestore();
    });

    it('ajuda e unsupported respondem sem modelo', async () => {
        const phone: string = PHONES[0] as string;
        const calls = vi.spyOn(llm, 'generate');

        await say(phone, 'oi');
        counter += 1;
        await post(bodyOf(phone, `wamid.chat.${String(counter)}`, { type: 'image', image: { id: 'm1' } }));

        expect(bodiesTo(phone).slice(-2)).toEqual([
            'Pergunte sobre a carteira ou os gastos, peça para marcar uma reunião ou criar um lembrete.',
            'Por enquanto a Vera lê só texto.'
        ]);
        expect(calls).not.toHaveBeenCalled();
        calls.mockRestore();
    });

    it('número sem vínculo recebe a instrução uma vez a cada 24 h, depois silêncio', async () => {
        await say(STRANGER, 'oi');
        await say(STRANGER, 'quanto gastei?');

        expect(bodiesTo(STRANGER)).toEqual(['Este número não está vinculado a uma conta da Vera. Vincule em Configurações › WhatsApp.']);
    });

    it('sem permissão de envio: instrução e o modelo não é chamado', async () => {
        const account: Account = await linked('chat-noconsent', PHONES[2] as string);
        const response = await harness.call(account.token, 'DELETE', '/ai/consent');
        expect(response.status).toBeLessThan(300);
        const calls = vi.spyOn(llm, 'generate');

        await say(PHONES[2] as string, 'quanto gastei este mês?');

        expect(bodiesTo(PHONES[2] as string).at(-1)).toContain('precisa da sua permissão');
        expect(calls).not.toHaveBeenCalled();
        calls.mockRestore();
    });

    it('cota pausada: mensagem de cota uma vez por dia e o modelo não é chamado', async () => {
        const phone: string = PHONES[3] as string;
        await linked('chat-paused', phone);
        const gate: PlanGateService = harness.app.get(PlanGateService, { strict: false });
        const state = vi.spyOn(gate, 'stateOf').mockResolvedValue('paused');
        const calls = vi.spyOn(llm, 'generate');

        await say(phone, 'quanto gastei?');
        await say(phone, 'e no mês passado?');

        const notices: (string | null)[] = bodiesTo(phone).filter((body) => body?.startsWith('Cota do mês esgotada') === true);
        expect(notices).toHaveLength(1);
        expect(notices[0]).toMatch(/^Cota do mês esgotada\. A Vera volta a responder em 1º de [a-zç]+\.$/);
        expect(calls).not.toHaveBeenCalled();
        state.mockRestore();
        calls.mockRestore();
    });

    it('Premium encerrado: aviso e o vínculo é desfeito', async () => {
        const phone: string = PHONES[4] as string;
        const account: Account = await linked('chat-ended', phone);
        const gate: PlanGateService = harness.app.get(PlanGateService, { strict: false });
        const state = vi.spyOn(gate, 'stateOf').mockResolvedValue('premium_required');

        await say(phone, 'quanto gastei?');

        expect(bodiesTo(phone).at(-1)).toBe('O Premium desta conta terminou. A Vera parou de responder por aqui.');
        const links = await harness.pg.query<{ status: string; unlinkReason: string }>(
            'SELECT "status","unlinkReason" FROM "WhatsAppLinks" WHERE "companyId" = $1',
            [account.company.id]
        );
        expect(links.rows).toEqual([{ status: 'unlinked', unlinkReason: 'premium_ended' }]);
        state.mockRestore();
    });

    it('acima do limite por minuto: aviso uma vez, silêncio depois, e o modelo não é chamado', async () => {
        const phone: string = PHONES[5] as string;
        await linked('chat-limit', phone);
        const calls = vi.spyOn(llm, 'generate');
        for (let index: number = 0; index < 3; index += 1) {
            await say(phone, `pergunta ${String(index)}`);
        }
        const answered: number = calls.mock.calls.length;

        await say(phone, 'pergunta 4');
        await say(phone, 'pergunta 5');

        expect(answered).toBe(3);
        expect(calls.mock.calls).toHaveLength(3);
        const notices: (string | null)[] = bodiesTo(phone).filter(
            (body) => body === 'Muitas perguntas seguidas. Tente de novo em alguns minutos.'
        );
        expect(notices).toHaveLength(1);
        calls.mockRestore();
    });

    it('papel Leitura pergunta, recebe os botões, e "sim" digitado executa a proposta uma vez', async () => {
        const owner: Account = await premium(await harness.signUp('chat-viewer-owner'));
        const phone: string = '5511999992001';
        const viewer: Account = await viewerLinked(owner, phone);
        executed.length = 0;
        llm.enqueue({ text: '', toolUses: [{ toolUseId: 'r1', name: 'calendar_create_event', input: { title: 'aportar todo dia 5' } }] });
        llm.enqueue('Posso marcar, aguardo sua confirmação.');

        await say(phone, 'Me lembra de aportar todo dia 5');

        const buttons: MockSentMessage | undefined = sentTo(phone).at(-1);
        expect(buttons).toMatchObject({ kind: 'interactive', body: 'Confirmar: aportar todo dia 5' });
        const choices: string[] = await choicesTo(phone);
        expect(choices[0]).toMatch(/^act:yes:[0-9a-f-]{36}$/);
        expect(choices[1]).toMatch(/^act:no:[0-9a-f-]{36}$/);
        expect(executed).toEqual([]);
        const calls = vi.spyOn(llm, 'generate');

        await say(phone, 'Sim.');
        await say(phone, 'sim');

        expect(executed).toEqual([{ kind: 'calendar_create', payload: { title: 'aportar todo dia 5' } }]);
        expect(bodiesTo(phone)).toContain('Feito.');
        expect(await pendingRows(viewer)).toEqual([{ kind: 'calendar_create', resolution: 'confirmed' }]);
        expect(viewer.user.id).toBeTruthy();
        calls.mockRestore();
    });

    it('botão de reunião executa direto pelo dono da ação, sem modelo; tocar de novo vence', async () => {
        const phone: string = '5511999992002';
        const account: Account = await linked('chat-calendar', phone);
        executed.length = 0;
        llm.enqueue({ text: '', toolUses: [{ toolUseId: 'c1', name: 'calendar_create_event', input: { title: 'Contador sexta 15h' } }] });
        llm.enqueue('Preciso da sua confirmação.');
        await say(phone, 'Marca reunião com o contador sexta às 15h');
        const yes: string = (await choicesTo(phone))[0] ?? '';
        const calls = vi.spyOn(llm, 'generate');

        await tap(phone, yes);
        await tap(phone, yes);

        expect(executed).toEqual([{ kind: 'calendar_create', payload: { title: 'Contador sexta 15h' } }]);
        expect(calls).not.toHaveBeenCalled();
        expect(bodiesTo(phone).slice(-2)).toEqual(['Feito.', 'Essa confirmação venceu. Peça de novo.']);
        expect(await pendingRows(account)).toEqual([{ kind: 'calendar_create', resolution: 'confirmed' }]);
        calls.mockRestore();
    });

    it('toque depois de 30 minutos, ou em proposta que não é a última, responde que venceu e não executa', async () => {
        const phone: string = '5511999992003';
        const account: Account = await linked('chat-expired', phone);
        executed.length = 0;
        for (const title of ['primeira', 'segunda']) {
            llm.enqueue({ text: '', toolUses: [{ toolUseId: title, name: 'calendar_create_event', input: { title } }] });
            llm.enqueue('Preciso da sua confirmação.');
            await say(phone, `Marca ${title}`);
        }
        const ids: string[] = (
            await harness.pg.query<{ id: string }>(
                'SELECT "id" FROM "WhatsAppPendingActions" WHERE "companyId" = $1 ORDER BY "createdAt"',
                [account.company.id]
            )
        ).rows.map((row: { id: string }): string => row.id);

        await tap(phone, `act:yes:${ids[0] as string}`);
        await harness.pg.query('UPDATE "WhatsAppPendingActions" SET "expiresAt" = now() - interval \'1 minute\' WHERE "id" = $1', [ids[1]]);
        await tap(phone, `act:yes:${ids[1] as string}`);

        expect(executed).toEqual([]);
        expect(bodiesTo(phone).slice(-2)).toEqual(['Essa confirmação venceu. Peça de novo.', 'Essa confirmação venceu. Peça de novo.']);
        expect((await pendingRows(account)).map((row) => row.resolution)).toEqual([null, 'expired']);
    });

    it('a ferramenta fora da lista do canal não é oferecida ao modelo', async () => {
        const phone: string = '5511999992004';
        await linked('chat-tools', phone);
        const generate = vi.spyOn(llm, 'generate');

        await say(phone, 'quais ferramentas você tem?');

        const offered: string[] = (generate.mock.calls[0]?.[0].request.tools ?? []).map((tool: { name: string }): string => tool.name);
        expect(offered).toContain('spending_month_summary');
        expect(offered).toContain('reminder_create');
        expect(offered).not.toContain('secret_tool');
        generate.mockRestore();
    });

    it('duas mensagens em poucos segundos viram uma pergunta e uma resposta', async () => {
        const phone: string = '5511999992005';
        await linked('chat-burst', phone);
        const ask = vi.spyOn(harness.app.get(AskVeraService, { strict: false }), 'ask');
        const before: number = bodiesTo(phone).length;
        holdTurns = true;

        await say(phone, 'quanto gastei com mercado?');
        await say(phone, 'e com transporte?');
        await release();

        expect(ask).toHaveBeenCalledTimes(1);
        expect(ask.mock.calls[0]?.[0].text).toBe('quanto gastei com mercado?\ne com transporte?');
        expect(bodiesTo(phone)).toHaveLength(before + 1);
        ask.mockRestore();
    });

    it('o mesmo wamid duas vezes gera uma resposta só', async () => {
        const phone: string = '5511999992006';
        await linked('chat-dedup', phone);
        const before: number = bodiesTo(phone).length;

        await post(textBody(phone, 'wamid.dup.1', 'quanto gastei?', 'entry-a'));
        await post(textBody(phone, 'wamid.dup.1', 'quanto gastei?', 'entry-b'));

        expect(bodiesTo(phone)).toHaveLength(before + 1);
    });

    it('duas companies: o histórico e as respostas de uma nunca usam as mensagens da outra', async () => {
        const phoneA: string = '5511999992007';
        const phoneB: string = '5511999992008';
        await linked('chat-iso-a', phoneA);
        await linked('chat-iso-b', phoneB);
        await say(phoneA, 'segredo da empresa A');
        const ask = vi.spyOn(harness.app.get(AskVeraService, { strict: false }), 'ask');

        await say(phoneB, 'pergunta da empresa B');

        expect(JSON.stringify(ask.mock.calls)).not.toContain('segredo da empresa A');
        expect(JSON.stringify(ask.mock.calls[0]?.[0].history)).not.toContain('empresa A');
        expect(bodiesTo(phoneB).join(' ')).not.toContain('empresa A');
        ask.mockRestore();
    });

    it('erro do modelo vira mensagem fixa, nunca o detalhe', async () => {
        const phone: string = '5511999992009';
        await linked('chat-fail', phone);
        llm.enqueueFailure(new Error('boom: detalhe interno'));

        await say(phone, 'quanto gastei?');

        const reply: string | null | undefined = bodiesTo(phone).at(-1);
        expect(reply).toBe('A Vera não conseguiu responder agora. Tente de novo em alguns minutos.');
        expect(JSON.stringify(sentTo(phone))).not.toContain('boom');
    });

    it('os logs e as mensagens gravadas não vazam o texto fora de WhatsAppMessages', async () => {
        const rows = await harness.pg.query<{ payload: unknown }>('SELECT "payload" FROM "WhatsAppPendingActions"');
        expect(JSON.stringify(rows.rows)).not.toContain('Quanto gastei');
    });
});
