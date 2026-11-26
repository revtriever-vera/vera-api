import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppContext } from '../../src/core/context/app-context.port';
import { MockLlmDriver } from '../../src/core/llm/drivers/mock-llm.driver';
import { QueueEnvelope } from '../../src/core/queue/queue.types';
import { AssistantTurnRequestedHandler } from '../../src/modules/assistant-chat/access/queue/assistant-turn.handler';
import { AssistantConversationApplication } from '../../src/modules/assistant-chat/application/assistant-conversation.application';
import { AssistantChatEraser } from '../../src/modules/assistant-chat/services/assistant-chat.eraser';
import { AssistantChatExporter } from '../../src/modules/assistant-chat/services/assistant-chat.exporter';
import { AssistantChatMemberLifecycle } from '../../src/modules/assistant-chat/services/assistant-chat.member-lifecycle';
import { AssistantSentPurge } from '../../src/modules/assistant-chat/services/assistant-sent.purge';
import { User } from '../../src/modules/identity/domain/identity.types';
import { UserDomain } from '../../src/modules/identity/domain/user.domain';
import { AuthTokens, SessionIssuerPort } from '../../src/modules/identity/ports/session-issuer.port';
import { PlanContractService } from '../../src/modules/plans/services/plan-contract.service';
import { Account, AllocationHarness } from './support/allocation-harness';
import { seedUsdRate } from './support/portfolio-seed';
import { CapturingPublisher, PublishedMessage } from './support/queue';

const HOSTED_ENV: Record<string, string> = {
    DEPLOYMENT_MODE: 'hosted',
    WHATSAPP_ACCESS_TOKEN: 'hosted-token-1a2b3c4d5e6f',
    WHATSAPP_PHONE_NUMBER_ID: '104857600000099',
    WHATSAPP_VERIFY_TOKEN: 'hosted-verify-1a2b3c4d',
    WHATSAPP_APP_SECRET: 'hosted-app-secret-1a2b3c4d',
    WHATSAPP_WABA_ID: '200000000000099',
    WHATSAPP_DISPLAY_NUMBER: '+55 11 4000-0000',
    LLM_REPEAT_LIMIT: '1000'
};

interface StartedBody {
    readonly turnId: string;
    readonly conversationId: string;
}

interface TurnBody {
    readonly status: string;
    readonly answer?: {
        readonly text: string;
        readonly source: string;
        readonly sentAvailable: boolean;
        readonly access: string;
        readonly notice: string | null;
    };
    readonly usage: { readonly state: string; readonly usedBps: number; readonly resetsAt: string };
}

interface ConversationBody {
    readonly conversationId: string | null;
    readonly messages: {
        readonly id: string;
        readonly role: string;
        readonly text: string;
        readonly status: string;
        readonly access: string;
        readonly sentAvailable: boolean;
    }[];
}

interface ProblemBody {
    readonly type: string;
    readonly meta?: { readonly resetsAt?: string };
}

class FlakyPublisher extends CapturingPublisher {
    public failNext: boolean = false;

    public override async publish(...args: Parameters<CapturingPublisher['publish']>): Promise<void> {
        if (this.failNext) {
            this.failNext = false;
            throw new Error('queue down');
        }
        return super.publish(...args);
    }
}

describe('assistant chat', () => {
    const publisher: FlakyPublisher = new FlakyPublisher();
    let harness: AllocationHarness;
    let llm: MockLlmDriver;
    let cursor: number = 0;

    beforeAll(async () => {
        Object.assign(process.env, HOSTED_ENV);
        harness = await AllocationHarness.start('assistant_chat', publisher);
        await seedUsdRate(harness);
        llm = harness.app.get(MockLlmDriver, { strict: false });
    });

    afterAll(async () => {
        for (const key of Object.keys(HOSTED_ENV)) {
            Reflect.deleteProperty(process.env, key);
        }
        await harness.stop();
    });

    async function premium(label: string, withConsent: boolean): Promise<Account> {
        const account: Account = await harness.signUp(label);
        const contracts: PlanContractService = harness.app.get(PlanContractService, { strict: false });
        await harness.inCompany(account.company.id, async () => {
            await contracts.open('premium', { startsAt: new Date(), subscriptionId: crypto.randomUUID() });
        });
        if (withConsent) {
            await harness.call(account.token, 'PUT', '/ai/consent', { noticeVersion: 1, source: 'summary_card' });
        }
        return account;
    }

    async function memberOf(owner: Account): Promise<Account> {
        const users: UserDomain = harness.app.get(UserDomain, { strict: false });
        const issuer: SessionIssuerPort = harness.app.get(SessionIssuerPort, { strict: false });
        const user: User = await harness.inCompany(owner.company.id, async () =>
            users.createMember({
                email: `member-${crypto.randomUUID()}@example.com`,
                name: 'Pessoa leitura',
                role: 'viewer',
                emailVerifiedAt: new Date(),
                termsAcceptedAt: new Date()
            })
        );
        const tokens: AuthTokens = await harness.inCompany(owner.company.id, async () =>
            issuer.issueForNewLogin(user, { ip: '203.0.113.9', userAgent: 'int-test' }, 'google', 'app')
        );
        return { company: owner.company, user, token: tokens.accessToken };
    }

    async function drain(owner: Account): Promise<void> {
        while (cursor < publisher.published.length) {
            const message: PublishedMessage = publisher.published[cursor] as PublishedMessage;
            cursor += 1;
            if (message.type !== 'assistant-chat.turn.requested') {
                continue;
            }
            const envelope: QueueEnvelope = {
                type: message.type,
                requestId: 'int-test',
                companyId: owner.company.id,
                occurredAt: new Date().toISOString(),
                trace: {},
                payload: message.payload
            };
            await harness.inCompany(owner.company.id, async () =>
                harness.app.get(AssistantTurnRequestedHandler, { strict: false }).handle(envelope)
            );
        }
    }

    async function ask(account: Account, text: string, reply: string = 'Abra **Gastos** no menu.'): Promise<StartedBody> {
        llm.enqueue(reply);
        const started = await harness.call<StartedBody>(account.token, 'POST', '/assistant/turns', { text, screen: { path: '/spending' } });
        expect(started.status).toBe(202);
        await drain(account);
        return started.body;
    }

    async function turn(account: Account, id: string): Promise<{ status: number; body: TurnBody }> {
        return harness.call<TurnBody>(account.token, 'GET', `/assistant/turns/${id}`);
    }

    async function count(sql: string, params: unknown[]): Promise<number> {
        const rows = await harness.pg.query<{ total: number }>(sql, params);
        return rows.rows[0]?.total ?? 0;
    }

    it('Free pergunta e recebe a resposta em modo help, com a chamada e o uso gravados como help', async () => {
        const free: Account = await harness.signUp('chat-free');

        const started: StartedBody = await ask(free, 'onde vejo meus gastos?');
        const answered = await turn(free, started.turnId);

        expect(answered.body).toMatchObject({ status: 'done', answer: { source: 'help', sentAvailable: false, notice: null } });
        expect(answered.body.answer?.text).toContain('Gastos');
        expect(answered.body.usage.state).toBe('ok');
        const calls = await harness.pg.query<{ feature: string }>('SELECT "feature" FROM "LlmCalls" WHERE "companyId" = $1', [
            free.company.id
        ]);
        expect(calls.rows.map((row) => row.feature)).toEqual(['help']);
        const used = await harness.pg.query<{ feature: string }>('SELECT "feature" FROM "PaidUsageEntries" WHERE "companyId" = $1', [
            free.company.id
        ]);
        expect(used.rows.map((row) => row.feature)).toEqual(['help']);
    });

    it('em help usa help_search, responde com o link da tela e registra a ferramenta usada', async () => {
        const free: Account = await harness.signUp('chat-help-tool');
        llm.enqueue({ text: '', toolUses: [{ toolUseId: 'u1', name: 'help_search', input: { query: 'reduzir gastos' } }] });
        llm.enqueue('Veja os cortes em [Cortes](/spending/cuts).');
        const started = await harness.call<StartedBody>(free.token, 'POST', '/assistant/turns', { text: 'como reduzir gastos?' });
        await drain(free);

        const answered = await turn(free, started.body.turnId);

        expect(answered.body).toMatchObject({ status: 'done', answer: { source: 'help' } });
        expect(answered.body.answer?.text).toContain('/spending/cuts');
        const current = await harness.call<{ messages: { toolsUsed: string[] }[] }>(free.token, 'GET', '/assistant/conversations/current');
        expect(current.body.messages.at(-1)?.toolsUsed).toEqual(['help_search']);
    });

    it('Premium sem permissão cai em help; com permissão responde em ai', async () => {
        const without: Account = await premium('chat-noconsent', false);
        const withConsent: Account = await premium('chat-consent', true);

        const helpTurn: StartedBody = await ask(without, 'como adiciono um ativo?');
        const aiTurn: StartedBody = await ask(withConsent, 'como adiciono um ativo?');

        expect((await turn(without, helpTurn.turnId)).body.answer?.source).toBe('help');
        expect((await turn(withConsent, aiTurn.turnId)).body.answer?.source).toBe('ai');
        const calls = await harness.pg.query<{ feature: string }>('SELECT "feature" FROM "LlmCalls" WHERE "companyId" = $1', [
            withConsent.company.id
        ]);
        expect(calls.rows.map((row) => row.feature)).toEqual(['ai']);
    });

    it('estado de acesso por resposta: Free vê premium_required, Premium sem permissão permission_required, e pergunta sobre o plano fica ok', async () => {
        const free: Account = await harness.signUp('chat-access-free');
        const without: Account = await premium('chat-access-noconsent', false);
        const withConsent: Account = await premium('chat-access-consent', true);
        const lockedTurn = async (account: Account, text: string): Promise<StartedBody> => {
            llm.enqueue({ text: '', toolUses: [{ toolUseId: 'u1', name: 'data_locked', input: {} }] });
            llm.enqueue(text);
            const started = await harness.call<StartedBody>(account.token, 'POST', '/assistant/turns', { text: 'quanto gastei no mês?' });
            await drain(account);
            return started.body;
        };

        const freeTurn: StartedBody = await lockedTurn(free, 'Isso é do Premium: veja o [Plano e uso](/settings/plan).');
        const withoutTurn: StartedBody = await lockedTurn(without, 'Falta permitir em [Dados e privacidade](/settings/privacy).');
        const planTurn: StartedBody = await ask(without, 'o que o Premium inclui?', 'Veja o [Plano e uso](/settings/plan).');
        const okTurn: StartedBody = await ask(withConsent, 'como adiciono um ativo?');

        expect((await turn(free, freeTurn.turnId)).body.answer).toMatchObject({ access: 'premium_required', sentAvailable: false });
        expect((await turn(without, withoutTurn.turnId)).body.answer).toMatchObject({ access: 'permission_required' });
        expect((await turn(without, planTurn.turnId)).body.answer?.access).toBe('ok');
        expect((await turn(withConsent, okTurn.turnId)).body.answer?.access).toBe('ok');
        const history = await harness.call<ConversationBody>(without.token, 'GET', '/assistant/conversations/current');
        expect(history.body.messages.filter((message) => message.role === 'vera').map((message) => message.access)).toEqual([
            'permission_required',
            'ok'
        ]);
    });

    it('a conversa é de quem pergunta: outra pessoa da conta e outra conta recebem 404, e a lista da outra conta vem vazia', async () => {
        const owner: Account = await harness.signUp('chat-private');
        const colleague: Account = await memberOf(owner);
        const stranger: Account = await harness.signUp('chat-stranger');
        const started: StartedBody = await ask(owner, 'oi, onde fica a carteira?');

        expect((await turn(colleague, started.turnId)).status).toBe(404);
        expect((await turn(stranger, started.turnId)).status).toBe(404);
        const feedback = await harness.call<ProblemBody>(colleague.token, 'POST', `/assistant/turns/${started.turnId}/feedback`, {
            helpful: false
        });
        expect(feedback.body.type).toBe('assistant.turn_not_found');
        const deletion = await harness.call<ProblemBody>(stranger.token, 'DELETE', `/assistant/conversations/${started.conversationId}`);
        expect(deletion.status).toBe(404);
        const continued = await harness.call<ProblemBody>(colleague.token, 'POST', '/assistant/turns', {
            conversationId: started.conversationId,
            text: 'e agora?'
        });
        expect(continued.body.type).toBe('assistant.turn_not_found');
        const others = await harness.call<ConversationBody>(stranger.token, 'GET', '/assistant/conversations/current');
        expect(others.body).toMatchObject({ conversationId: null, messages: [] });
        const mine = await harness.call<ConversationBody>(owner.token, 'GET', '/assistant/conversations/current');
        expect(mine.body.messages.map((message) => message.role)).toEqual(['person', 'vera']);
        expect(mine.body.conversationId).toBe(started.conversationId);
    });

    it('continua a conversa atual, devolve as últimas 20 mensagens e apaga a conversa a pedido', async () => {
        const owner: Account = await harness.signUp('chat-history');
        for (let index = 0; index < 11; index += 1) {
            await ask(owner, `pergunta ${String(index)}`);
        }

        const current = await harness.call<ConversationBody>(owner.token, 'GET', '/assistant/conversations/current');
        const conversations: number = await count('SELECT count(*)::int AS total FROM "AssistantConversations" WHERE "companyId" = $1', [
            owner.company.id
        ]);

        expect(current.body.messages).toHaveLength(20);
        expect(conversations).toBe(1);
        expect((await harness.call(owner.token, 'DELETE', `/assistant/conversations/${current.body.conversationId ?? ''}`)).status).toBe(
            204
        );
        const after: number = await count('SELECT count(*)::int AS total FROM "AssistantMessages" WHERE "companyId" = $1', [
            owner.company.id
        ]);
        expect(after).toBe(0);
    });

    it('teto da ajuda de R$ 0,50 estourado no Free: usage.cap_reached com resetsAt e nada gravado', async () => {
        const free: Account = await harness.signUp('chat-cap');
        await harness.pg.query(
            `INSERT INTO "PaidUsageEntries" ("id","companyId","period","feature","task","referenceId","costMicros","outcome")
             VALUES ($1,$2,to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM'),'help','ask_vera_app_step','seed',500000,'answered')`,
            [crypto.randomUUID(), free.company.id]
        );

        const refused = await harness.call<ProblemBody>(free.token, 'POST', '/assistant/turns', { text: 'quanto custa?' });

        expect(refused.status).toBe(429);
        expect(refused.body.type).toBe('usage.cap_reached');
        expect(refused.body.meta?.resetsAt).toMatch(/^\d{4}-\d{2}-01T/);
        expect(await count('SELECT count(*)::int AS total FROM "AssistantConversations" WHERE "companyId" = $1', [free.company.id])).toBe(
            0
        );
    });

    it('o teto da ajuda do Free não trava quem tem o plano: no Premium a ajuda divide o teto do total', async () => {
        const owner: Account = await premium('chat-premium-help', false);
        await harness.pg.query(
            `INSERT INTO "PaidUsageEntries" ("id","companyId","period","feature","task","referenceId","costMicros","outcome")
             VALUES ($1,$2,to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM'),'help','ask_vera_app_step','seed',900000,'answered')`,
            [crypto.randomUUID(), owner.company.id]
        );

        const started: StartedBody = await ask(owner, 'como exporto?');

        expect((await turn(owner, started.turnId)).body.status).toBe('done');
    });

    it('falha ao enfileirar não deixa conversa nem mensagens; falha do modelo deixa a pergunta e uma resposta failed', async () => {
        const owner: Account = await harness.signUp('chat-failure');
        publisher.failNext = true;

        const refused = await harness.call<ProblemBody>(owner.token, 'POST', '/assistant/turns', { text: 'oi?' });

        expect(refused.status).toBe(500);
        expect(await count('SELECT count(*)::int AS total FROM "AssistantConversations" WHERE "companyId" = $1', [owner.company.id])).toBe(
            0
        );
        expect(await count('SELECT count(*)::int AS total FROM "AssistantMessages" WHERE "companyId" = $1', [owner.company.id])).toBe(0);

        llm.enqueueFailure(new Error('provider down'));
        const started = await harness.call<StartedBody>(owner.token, 'POST', '/assistant/turns', { text: 'quanto gastei?' });
        await drain(owner);
        expect((await turn(owner, started.body.turnId)).body.status).toBe('failed');
        const rows = await harness.pg.query<{ role: string; status: string }>(
            'SELECT "role","status" FROM "AssistantMessages" WHERE "companyId" = $1 ORDER BY "createdAt"',
            [owner.company.id]
        );
        expect(rows.rows).toEqual([
            { role: 'person', status: 'done' },
            { role: 'vera', status: 'failed' }
        ]);
    });

    it('turno pendente além do prazo vira failed na leitura, e a resposta tardia não o reabre', async () => {
        const owner: Account = await harness.signUp('chat-stale');
        llm.enqueue('resposta tardia');
        const started = await harness.call<StartedBody>(owner.token, 'POST', '/assistant/turns', { text: 'oi?' });
        await harness.pg.query(`UPDATE "AssistantMessages" SET "createdAt" = now() - interval '10 minutes' WHERE "companyId" = $1`, [
            owner.company.id
        ]);

        expect((await turn(owner, started.body.turnId)).body.status).toBe('failed');
        await drain(owner);
        expect((await turn(owner, started.body.turnId)).body.status).toBe('failed');
    });

    it('valida o corpo: texto vazio ou acima de 1000 caracteres dá 400', async () => {
        const owner: Account = await harness.signUp('chat-validation');

        expect((await harness.call(owner.token, 'POST', '/assistant/turns', { text: '' })).status).toBe(400);
        expect((await harness.call(owner.token, 'POST', '/assistant/turns', { text: 'a'.repeat(1001) })).status).toBe(400);
        expect((await harness.call(owner.token, 'POST', '/assistant/turns', { text: 'ok' })).status).toBe(202);
        expect((await harness.call(null, 'POST', '/assistant/turns', { text: 'ok' })).status).toBe(401);
    });

    it('feedback conta o sinal e responde 204', async () => {
        const owner: Account = await harness.signUp('chat-feedback');
        const started: StartedBody = await ask(owner, 'onde fica?');

        const response = await harness.call(owner.token, 'POST', `/assistant/turns/${started.turnId}/feedback`, { helpful: false });

        expect(response.status).toBe(204);
        expect((await harness.call(owner.token, 'POST', `/assistant/turns/${started.turnId}/feedback`, { helpful: true })).status).toBe(
            400
        );
    });

    it('retenção apaga com 31 dias e mantém com 29; desligar a permissão zera o que foi enviado', async () => {
        const owner: Account = await harness.signUp('chat-retention');
        const old: StartedBody = await ask(owner, 'pergunta antiga');
        const fresh: StartedBody = await ask(owner, 'pergunta recente');
        await harness.pg.query(`UPDATE "AssistantMessages" SET "createdAt" = now() - interval '31 days' WHERE "id" = $1`, [old.turnId]);
        await harness.pg.query(`UPDATE "AssistantMessages" SET "createdAt" = now() - interval '29 days' WHERE "id" = $1`, [fresh.turnId]);
        await harness.pg.query(
            `UPDATE "AssistantMessages" SET "sent" = '[{"tool":"portfolio_overview","payload":{}}]'::json WHERE "id" = $1`,
            [fresh.turnId]
        );
        const application: AssistantConversationApplication = harness.app.get(AssistantConversationApplication, { strict: false });

        await application.purgeExpired();

        const ids = await harness.pg.query<{ id: string }>('SELECT "id" FROM "AssistantMessages" WHERE "id" = ANY($1)', [
            [old.turnId, fresh.turnId]
        ]);
        expect(ids.rows.map((row) => row.id)).toEqual([fresh.turnId]);
        const purge: AssistantSentPurge = harness.app.get(AssistantSentPurge, { strict: false });
        await harness.inCompany(owner.company.id, async () => purge.purge());
        const sent = await harness.pg.query<{ sent: unknown }>('SELECT "sent" FROM "AssistantMessages" WHERE "companyId" = $1', [
            owner.company.id
        ]);
        expect(sent.rows.every((row) => row.sent === null)).toBe(true);
    });

    it('exporta só a conversa de quem pede, apaga a da pessoa que sai e tudo da conta na exclusão', async () => {
        const owner: Account = await harness.signUp('chat-lgpd');
        const colleague: Account = await memberOf(owner);
        await ask(owner, 'pergunta do dono');
        await ask(colleague, 'pergunta do colega');
        const exporter: AssistantChatExporter = harness.app.get(AssistantChatExporter, { strict: false });
        const lifecycle: AssistantChatMemberLifecycle = harness.app.get(AssistantChatMemberLifecycle, { strict: false });
        const eraser: AssistantChatEraser = harness.app.get(AssistantChatEraser, { strict: false });

        const exported = await harness.app
            .get(AppContext)
            .run({ requestId: 'x', companyId: owner.company.id, userId: owner.user.id, locale: 'pt-BR' }, async () => exporter.exportAll());

        expect(exported).toHaveLength(1);
        expect(exported[0]?.messages.map((message) => message.text)).toEqual(['pergunta do dono', 'Abra **Gastos** no menu.']);
        await harness.inCompany(owner.company.id, async () => lifecycle.onMemberRemoved(colleague.user.id));
        expect(await count('SELECT count(*)::int AS total FROM "AssistantConversations" WHERE "companyId" = $1', [owner.company.id])).toBe(
            1
        );
        expect(await harness.inCompany(owner.company.id, async () => eraser.eraseAll(owner.company.id))).toBe(1);
        expect(await count('SELECT count(*)::int AS total FROM "AssistantMessages" WHERE "companyId" = $1', [owner.company.id])).toBe(0);
    });
});
