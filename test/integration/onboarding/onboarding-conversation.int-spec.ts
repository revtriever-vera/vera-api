import { afterAll, beforeAll, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { MockLlmDriver } from '../../../src/core/llm/drivers/mock-llm.driver';
import { AssistantConversationApplication } from '../../../src/modules/assistant-chat/application/assistant-conversation.application';
import { AssistantChatMemberLifecycle } from '../../../src/modules/assistant-chat/services/assistant-chat.member-lifecycle';
import { asRole } from '../../support/as-role';
import { Account, AllocationHarness } from '../support/allocation-harness';

interface Chip {
    readonly id: string;
    readonly label: string;
    readonly quiet?: boolean;
    readonly action: { readonly type: string };
}

interface Message {
    readonly id: string;
    readonly role: string;
    readonly text: string;
    readonly createdAt: string;
    readonly payload?: { readonly chips?: Chip[]; readonly card?: { readonly type: string }; readonly open: boolean };
}

interface Conversation {
    readonly conversationId: string;
    readonly status: string;
    readonly step: string;
    readonly remainingSteps: number;
    readonly modules: { readonly portfolio: boolean; readonly spending: boolean };
    readonly pending: { readonly key: string; readonly label: string }[];
    readonly messages: Message[];
}

interface ProblemBody {
    readonly type: string;
    readonly meta?: Record<string, unknown>;
}

interface ExportBody {
    readonly sections: {
        readonly assistant_chat: { readonly kind: string; readonly messages: { readonly role: string; readonly text: string }[] }[];
    };
}

const PATH: string = '/onboarding/conversation';
const ACTIONS: string = '/onboarding/conversation/actions';

describe('conversa de roteiro do onboarding', () => {
    let harness: AllocationHarness;
    let generate: MockInstance;

    beforeAll(async () => {
        harness = await AllocationHarness.start('onboarding_conversation');
        generate = vi.spyOn(harness.app.get(MockLlmDriver, { strict: false }), 'generate');
    });

    beforeEach(() => {
        generate.mockClear();
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function open(account: Account): Promise<Conversation> {
        const response = await harness.call<Conversation>(account.token, 'GET', PATH);
        expect(response.status).toBe(200);
        return response.body;
    }

    async function act(account: Account, body: Record<string, unknown>): Promise<Conversation> {
        const response = await harness.call<Conversation>(account.token, 'POST', ACTIONS, body);
        expect(response.status).toBe(200);
        return response.body;
    }

    it('o primeiro GET de um Editor cria a conversa com as boas-vindas e os 4 botões; os seguintes devolvem a mesma', async () => {
        const owner: Account = await harness.signUp('conv_open');
        const editor: Account = await asRole(harness, owner, 'editor');

        const first: Conversation = await open(editor);

        expect(first).toMatchObject({ status: 'active', step: 'modules', remainingSteps: 1, pending: [] });
        expect(first.messages).toHaveLength(1);
        expect(first.messages[0]?.role).toBe('vera');
        expect(first.messages[0]?.text).toMatch(/^Oi, Pessoa! Eu sou a Vera\./);
        expect(first.messages[0]?.payload?.open).toBe(true);
        expect(first.messages[0]?.payload?.chips?.map((chip: Chip) => chip.id)).toEqual([
            'modules.portfolio',
            'modules.spending',
            'modules.both',
            'modules.explain'
        ]);

        const again: Conversation = await open(owner);
        expect(again.conversationId).toBe(first.conversationId);
        expect(again.messages.map((message: Message) => message.id)).toEqual(first.messages.map((message: Message) => message.id));
        const rows = await harness.pg.query('SELECT 1 FROM "AssistantConversations" WHERE "companyId" = $1 AND "kind" = $2', [
            owner.company.id,
            'onboarding'
        ]);
        expect(rows.rowCount).toBe(1);
    });

    it('um segundo Editor continua de onde o primeiro parou, com o histórico inteiro', async () => {
        const owner: Account = await harness.signUp('conv_shared');
        const editor: Account = await asRole(harness, owner, 'editor');
        await open(owner);
        await act(owner, { type: 'EXPLAIN' });

        const seen: Conversation = await open(editor);

        expect(seen.step).toBe('explain');
        expect(seen.messages.map((message: Message) => message.role)).toEqual(['vera', 'person', 'vera']);
        expect(seen.messages.filter((message: Message) => message.payload?.open === true)).toHaveLength(1);
        expect(seen.messages.at(-1)?.payload?.open).toBe(true);
    });

    it('quem tem papel Leitura recebe 403 no GET e nas ações', async () => {
        const owner: Account = await harness.signUp('conv_viewer');
        const viewer: Account = await asRole(harness, owner, 'viewer');

        const read = await harness.call<ProblemBody>(viewer.token, 'GET', PATH);
        const write = await harness.call<ProblemBody>(viewer.token, 'POST', ACTIONS, { type: 'SKIP' });

        expect(read.status).toBe(403);
        expect(read.body.type).toBe('members.forbidden_role');
        expect(write.status).toBe(403);
        const rows = await harness.pg.query('SELECT 1 FROM "AssistantConversations" WHERE "companyId" = $1', [owner.company.id]);
        expect(rows.rowCount).toBe(0);
    });

    it('CHOOSE_MODULES grava os módulos da conta, responde com a fala do protótipo e conclui o onboarding', async () => {
        const owner: Account = await harness.signUp('conv_choose');

        const after: Conversation = await act(owner, { type: 'CHOOSE_MODULES', portfolio: false, spending: true });

        expect(after.messages.slice(1).map((message: Message) => `${message.role}: ${message.text}`)).toEqual([
            'person: Meus gastos',
            'vera: Fechado. Investimentos fica desligado por enquanto; dá para ligar em Configurações › Módulos, ou é só me pedir aqui.',
            'vera: Pronto, sua conta está montada. Aqui está o que ficou:'
        ]);
        expect(after).toMatchObject({
            status: 'done',
            step: 'done',
            remainingSteps: 0,
            modules: { portfolio: false, spending: true },
            pending: [{ key: 'setup.spendPath', label: 'Configuração: Gastos' }]
        });
        expect(after.messages.at(-1)?.payload).toMatchObject({ card: { type: 'summary' }, open: true });
        expect(after.messages[0]?.payload?.open).toBe(false);
        const me = await harness.call<{ modules: Conversation['modules'] }>(owner.token, 'GET', '/auth/me');
        expect(me.body.modules).toEqual({ portfolio: false, spending: true });
        const gate = await harness.call<{ status: string; completedAt: string | null }>(owner.token, 'GET', '/onboarding');
        expect(gate.body.status).toBe('closed');
        expect(gate.body.completedAt).not.toBeNull();
    });

    it('SKIP deixa paused, RESUME reabre do ponto em que parou e FINISH_NOW fecha com uma pendência por etapa que faltou', async () => {
        const owner: Account = await harness.signUp('conv_pause');
        await open(owner);

        const paused: Conversation = await act(owner, { type: 'SKIP' });
        expect(paused).toMatchObject({ status: 'paused', step: 'modules', remainingSteps: 1 });
        expect(paused.messages.at(-1)?.role).toBe('system');
        const gateWhilePaused = await harness.call<{ status: string }>(owner.token, 'GET', '/onboarding');
        expect(gateWhilePaused.body.status).not.toBe('closed');

        const resumed: Conversation = await act(owner, { type: 'RESUME' });
        expect(resumed).toMatchObject({ status: 'active', step: 'modules' });
        expect(resumed.messages.at(-1)?.text).toBe('Que bom te ver de volta. Para começar: o que você quer acompanhar aqui?');
        expect(resumed.messages.at(-1)?.payload?.chips).toHaveLength(4);

        const finished: Conversation = await act(owner, { type: 'FINISH_NOW' });
        expect(finished).toMatchObject({
            status: 'done',
            pending: [{ key: 'setup.modules', label: 'Configuração: escolher o que acompanhar' }]
        });
        const gate = await harness.call<{ status: string }>(owner.token, 'GET', '/onboarding');
        expect(gate.body.status).toBe('closed');
    });

    it('TEXT com "?" recebe a resposta do roteiro; com palavras de módulo, escolhe o módulo', async () => {
        const owner: Account = await harness.signUp('conv_text');

        const question: Conversation = await act(owner, { type: 'TEXT', text: 'quanto rendeu minha carteira?' });
        expect(question.messages.at(-1)?.text).toMatch(/^Aqui eu sigo um roteiro curto para montar a conta/);
        expect(question.messages.at(-1)?.payload?.chips).toHaveLength(4);
        expect(question.status).toBe('active');

        const chosen: Conversation = await act(owner, { type: 'TEXT', text: 'os dois' });
        expect(chosen.messages.find((message: Message) => message.role === 'person' && message.text === 'os dois')).toBeDefined();
        expect(chosen.modules).toEqual({ portfolio: true, spending: true });
        expect(chosen.pending.map((item: { label: string }) => item.label)).toEqual([
            'Configuração: Investimentos',
            'Configuração: Gastos'
        ]);
    });

    it('ação fora de hora responde 409 onboarding.action_out_of_step e não escreve nada', async () => {
        const owner: Account = await harness.signUp('conv_out_of_step');
        const before: Conversation = await open(owner);

        const response = await harness.call<ProblemBody>(owner.token, 'POST', ACTIONS, { type: 'CONFIRM_IMPORT' });

        expect(response.status).toBe(409);
        expect(response.body.type).toBe('onboarding.action_out_of_step');
        expect(response.body.meta).toMatchObject({ action: 'CONFIRM_IMPORT', step: 'modules', status: 'active' });
        expect((await open(owner)).messages).toHaveLength(before.messages.length);
        expect((await harness.call(owner.token, 'POST', ACTIONS, { type: 'RESUME' })).status).toBe(409);
    });

    it('corpo inválido responde 400', async () => {
        const owner: Account = await harness.signUp('conv_invalid');

        expect((await harness.call(owner.token, 'POST', ACTIONS, { type: 'DANCE' })).status).toBe(400);
        expect(
            (await harness.call(owner.token, 'POST', ACTIONS, { type: 'CHOOSE_MODULES', portfolio: false, spending: false })).status
        ).toBe(400);
        expect((await harness.call(owner.token, 'POST', ACTIONS, { type: 'TEXT', text: '   ' })).status).toBe(400);
        expect((await harness.call(null, 'GET', PATH)).status).toBe(401);
    });

    it('GET /assistant/conversations/current continua devolvendo só conversas do tipo chat', async () => {
        const owner: Account = await harness.signUp('conv_current');
        await open(owner);

        const current = await harness.call<{ conversationId: string | null; messages: unknown[] }>(
            owner.token,
            'GET',
            '/assistant/conversations/current'
        );

        expect(current.status).toBe(200);
        expect(current.body.conversationId).toBeNull();
        expect(current.body.messages).toEqual([]);
    });

    it('a retenção mantém inteira uma conversa de onboarding parada há 40 dias e só apaga a pergunta livre antiga', async () => {
        const owner: Account = await harness.signUp('conv_retention');
        const conversation: Conversation = await act(owner, { type: 'EXPLAIN' });
        await harness.pg.query(
            `INSERT INTO "AssistantMessages" ("id","companyId","conversationId","role","status","text","createdAt","updatedAt")
             VALUES ($1,$2,$3,'person','done','pergunta livre', now() - interval '40 days', now() - interval '40 days')`,
            [crypto.randomUUID(), owner.company.id, conversation.conversationId]
        );
        await harness.pg.query(`UPDATE "AssistantMessages" SET "createdAt" = now() - interval '40 days' WHERE "conversationId" = $1`, [
            conversation.conversationId
        ]);
        await harness.pg.query(`UPDATE "AssistantConversations" SET "lastMessageAt" = now() - interval '40 days' WHERE "id" = $1`, [
            conversation.conversationId
        ]);

        await harness.app.get(AssistantConversationApplication, { strict: false }).purgeExpired();

        const kept: Conversation = await open(owner);
        expect(kept.conversationId).toBe(conversation.conversationId);
        expect(kept.messages.map((message: Message) => message.id)).toEqual(conversation.messages.map((message: Message) => message.id));
    });

    it('a conversa entra na exportação da conta e é apagada com ela', async () => {
        const owner: Account = await harness.signUp('conv_lgpd');
        await act(owner, { type: 'CHOOSE_MODULES', portfolio: true, spending: false });

        const exported = await harness.call<ExportBody>(owner.token, 'GET', '/account/export');

        expect(exported.status).toBe(200);
        const section = exported.body.sections.assistant_chat.find((item: { kind: string }) => item.kind === 'onboarding');
        expect(section?.messages.map((message: { role: string }) => message.role)).toEqual(['vera', 'person', 'vera', 'vera']);
        const deleted = await harness.call(owner.token, 'DELETE', '/account', { confirmEmail: owner.user.email });
        expect(deleted.status).toBe(204);
        const rows = await harness.pg.query('SELECT 1 FROM "AssistantMessages" WHERE "companyId" = $1', [owner.company.id]);
        expect(rows.rowCount).toBe(0);
    });

    it('a saída do Editor que abriu a conversa não apaga a conversa da conta', async () => {
        const owner: Account = await harness.signUp('conv_member_exit');
        const editor: Account = await asRole(harness, owner, 'editor');
        const opened: Conversation = await open(editor);

        const lifecycle: AssistantChatMemberLifecycle = harness.app.get(AssistantChatMemberLifecycle, { strict: false });

        await harness.inCompany(owner.company.id, async () => lifecycle.onMemberRemoved(editor.user.id));

        const kept: Conversation = await open(owner);
        expect(kept.conversationId).toBe(opened.conversationId);
        expect(kept.messages).toHaveLength(opened.messages.length);
    });

    it('o roteiro funciona no Free sem a permissão de envio e não chama o modelo de linguagem', async () => {
        const owner: Account = await harness.signUp('conv_no_llm');

        await open(owner);
        await act(owner, { type: 'TEXT', text: 'o que é isso?' });
        await act(owner, { type: 'EXPLAIN' });
        await act(owner, { type: 'CHOOSE_MODULES', portfolio: true, spending: true });

        expect(generate).not.toHaveBeenCalled();
        const calls = await harness.pg.query('SELECT 1 FROM "LlmCalls" WHERE "companyId" = $1', [owner.company.id]);
        expect(calls.rowCount).toBe(0);
    });
});
