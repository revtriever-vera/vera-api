import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LlmDriverCall } from '../../src/core/llm/drivers/llm-driver';
import { MockLlmDriver } from '../../src/core/llm/drivers/mock-llm.driver';
import { JsonObject, LlmToolDefinition } from '../../src/core/llm/llm.types';
import { QueueEnvelope } from '../../src/core/queue/queue.types';
import { AssistantTurnRequestedHandler } from '../../src/modules/assistant-chat/access/queue/assistant-turn.handler';
import { User } from '../../src/modules/identity/domain/identity.types';
import { UserDomain } from '../../src/modules/identity/domain/user.domain';
import { AuthTokens, SessionIssuerPort } from '../../src/modules/identity/ports/session-issuer.port';
import { PlanContractService } from '../../src/modules/plans/services/plan-contract.service';
import { FinancialAccountService } from '../../src/modules/transactions/services/financial-account.service';
import { TransactionIngestionService } from '../../src/modules/transactions/services/transaction-ingestion.service';
import { DateUtil } from '../../src/shared/utils/date.util';
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

const TODAY: string = DateUtil.todayInBrazil();
const MERCHANT_DESCRIPTION: string = 'COMPRA CARTAO MERCADO ZEBRA LTDA';
const WRITE_TOOLS: readonly string[] = ['goal_create', 'transaction_categorize'];
const GOAL_INPUT: JsonObject = { name: 'Viagem', targetMinor: 1_200_000, targetMonth: '2027-12', kind: 'travel' };
const CLAIM_OF_CREATION: string = 'Pronto, criei o objetivo de viagem para você!';

interface StartedBody {
    readonly turnId: string;
    readonly conversationId: string;
}

interface ActionSummary {
    readonly id: string;
    readonly tool: string;
    readonly summary: string;
    readonly status: string;
    readonly resultText: string | null;
}

interface TurnBody {
    readonly status: string;
    readonly answer?: { readonly text: string; readonly toolsUsed: string[]; readonly action: ActionSummary | null };
}

interface ActionBody extends ActionSummary {
    readonly candidates: { id: string; version: string; description: string; amountMinor: number }[];
}

interface ProblemBody {
    readonly type: string;
}

describe('assistant chat: ações com confirmação', () => {
    const publisher: CapturingPublisher = new CapturingPublisher();
    let harness: AllocationHarness;
    let llm: MockLlmDriver;
    let cursor: number = 0;
    let requests: LlmDriverCall[] = [];

    beforeAll(async () => {
        Object.assign(process.env, HOSTED_ENV);
        harness = await AllocationHarness.start('assistant_actions', publisher);
        await seedUsdRate(harness);
        llm = harness.app.get(MockLlmDriver, { strict: false });
        const original: MockLlmDriver['generate'] = llm.generate.bind(llm);
        vi.spyOn(llm, 'generate').mockImplementation((call: LlmDriverCall) => {
            requests.push(call);
            return original(call);
        });
    });

    afterEach(() => {
        requests = [];
    });

    afterAll(async () => {
        vi.restoreAllMocks();
        for (const key of Object.keys(HOSTED_ENV)) {
            Reflect.deleteProperty(process.env, key);
        }
        await harness.stop();
    });

    async function premium(label: string): Promise<Account> {
        const account: Account = await harness.signUp(label);
        const contracts: PlanContractService = harness.app.get(PlanContractService, { strict: false });
        await harness.inCompany(account.company.id, async () => {
            await contracts.open('premium', { startsAt: new Date(), subscriptionId: crypto.randomUUID() });
        });
        await harness.call(account.token, 'PUT', '/ai/consent', { noticeVersion: 1, source: 'summary_card' });
        return account;
    }

    async function memberOf(owner: Account, role: 'viewer' | 'editor'): Promise<Account> {
        const users: UserDomain = harness.app.get(UserDomain, { strict: false });
        const issuer: SessionIssuerPort = harness.app.get(SessionIssuerPort, { strict: false });
        const user: User = await harness.inCompany(owner.company.id, async () =>
            users.createMember({
                email: `member-${crypto.randomUUID()}@example.com`,
                name: `Pessoa ${role}`,
                role,
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

    async function propose(
        account: Account,
        tool: string,
        input: JsonObject,
        question: string = 'cria o objetivo'
    ): Promise<ActionSummary> {
        llm.enqueue({ text: '', toolUses: [{ toolUseId: `use-${tool}`, name: tool, input }] });
        llm.enqueue(CLAIM_OF_CREATION);
        const started = await harness.call<StartedBody>(account.token, 'POST', '/assistant/turns', { text: question });
        expect(started.status).toBe(202);
        await drain(account);
        const answered = await harness.call<TurnBody>(account.token, 'GET', `/assistant/turns/${started.body.turnId}`);
        expect(answered.body.status).toBe('done');
        return answered.body.answer?.action as ActionSummary;
    }

    async function count(sql: string, params: unknown[]): Promise<number> {
        const rows = await harness.pg.query<{ total: number }>(sql, params);
        return rows.rows[0]?.total ?? 0;
    }

    const goalsOf = (account: Account): Promise<number> =>
        count('SELECT count(*)::int AS total FROM "Goals" WHERE "companyId" = $1', [account.company.id]);

    function toolNamesOf(request: LlmDriverCall): string[] {
        return (request.request.tools ?? []).map((tool: LlmToolDefinition): string => tool.name);
    }

    it('o modelo só propõe: o cartão chega com o resumo, o texto do modelo some e nada é criado até o sim', async () => {
        const owner: Account = await premium('actions-goal');

        const action: ActionSummary = await propose(owner, 'goal_create', GOAL_INPUT);

        expect(action).toMatchObject({ tool: 'goal_create', status: 'open', resultText: null });
        expect(action.summary).toBe('Criar o objetivo Viagem: R$ 12.000 até dezembro de 2027.');
        const current = await harness.call<{ messages: { text: string; action: ActionSummary | null }[] }>(
            owner.token,
            'GET',
            '/assistant/conversations/current'
        );
        expect(current.body.messages.at(-1)).toMatchObject({ text: action.summary, action: { id: action.id, status: 'open' } });
        expect(current.body.messages.map((message) => message.text).join(' ')).not.toContain('criei');
        expect(await goalsOf(owner)).toBe(0);
    });

    it('o sim cria o objetivo uma vez, com a confirmação no tom de voz, e um segundo sim recebe 409', async () => {
        const owner: Account = await premium('actions-confirm');
        const action: ActionSummary = await propose(owner, 'goal_create', GOAL_INPUT);

        const confirmed = await harness.call<ActionSummary>(owner.token, 'POST', `/assistant/actions/${action.id}/confirm`, {});
        const again = await harness.call<ProblemBody>(owner.token, 'POST', `/assistant/actions/${action.id}/confirm`, {});

        expect(confirmed.status).toBe(200);
        expect(confirmed.body).toMatchObject({
            status: 'confirmed',
            resultText: 'Objetivo criado: Viagem, R$ 12.000 até dezembro de 2027.'
        });
        expect(again.status).toBe(409);
        expect(again.body.type).toBe('assistant.action_resolved');
        expect(await goalsOf(owner)).toBe(1);
        const reread = await harness.call<ActionBody>(owner.token, 'GET', `/assistant/actions/${action.id}`);
        expect(reread.body).toMatchObject({ status: 'confirmed', candidates: [] });
    });

    it('dois sim ao mesmo tempo executam uma vez só', async () => {
        const owner: Account = await premium('actions-race');
        const action: ActionSummary = await propose(owner, 'goal_create', GOAL_INPUT);

        const results = await Promise.all([
            harness.call<ProblemBody>(owner.token, 'POST', `/assistant/actions/${action.id}/confirm`, {}),
            harness.call<ProblemBody>(owner.token, 'POST', `/assistant/actions/${action.id}/confirm`, {})
        ]);

        expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
        expect(await goalsOf(owner)).toBe(1);
    });

    it('estado mudou entre a proposta e o sim: 409 assistant.confirmation_stale, nada é criado e a ação fica stale', async () => {
        const owner: Account = await premium('actions-stale');
        const action: ActionSummary = await propose(owner, 'goal_create', GOAL_INPUT);
        const other = await harness.call(owner.token, 'POST', '/goals', {
            kind: 'other',
            name: 'Reforma',
            targetMinor: 500_000,
            targetDate: '2028-06-30',
            holdings: []
        });
        expect(other.status).toBe(201);

        const stale = await harness.call<ProblemBody>(owner.token, 'POST', `/assistant/actions/${action.id}/confirm`, {});

        expect(stale.status).toBe(409);
        expect(stale.body.type).toBe('assistant.confirmation_stale');
        expect(await goalsOf(owner)).toBe(1);
        expect((await harness.call<ActionBody>(owner.token, 'GET', `/assistant/actions/${action.id}`)).body.status).toBe('stale');
    });

    it('uma ação pendente por conversa: a proposta nova cancela a anterior, e cancelar não executa', async () => {
        const owner: Account = await premium('actions-one-per-conversation');
        const first: ActionSummary = await propose(owner, 'goal_create', GOAL_INPUT);
        const second: ActionSummary = await propose(owner, 'goal_create', { ...GOAL_INPUT, name: 'Casa' });

        const replaced = await harness.call<ProblemBody>(owner.token, 'POST', `/assistant/actions/${first.id}/confirm`, {});
        const canceled = await harness.call<ActionSummary>(owner.token, 'POST', `/assistant/actions/${second.id}/cancel`);
        const afterCancel = await harness.call<ProblemBody>(owner.token, 'POST', `/assistant/actions/${second.id}/confirm`, {});

        expect(replaced.status).toBe(409);
        expect(canceled.body.status).toBe('canceled');
        expect(afterCancel.body.type).toBe('assistant.action_resolved');
        expect(await goalsOf(owner)).toBe(0);
        expect(
            await count('SELECT count(*)::int AS total FROM "AssistantPendingActions" WHERE "companyId" = $1 AND "status" = $2', [
                owner.company.id,
                'open'
            ])
        ).toBe(0);
    });

    it('Leitura não recebe as ferramentas de ação nem confirma; Editor e Dono recebem', async () => {
        const owner: Account = await premium('actions-roles');
        const viewer: Account = await memberOf(owner, 'viewer');
        const editor: Account = await memberOf(owner, 'editor');
        const action: ActionSummary = await propose(owner, 'goal_create', GOAL_INPUT);
        const ownerTools: string[] = toolNamesOf(requests[0] as LlmDriverCall);
        requests = [];

        llm.enqueue('Seu acesso é só de leitura.');
        await harness.call(viewer.token, 'POST', '/assistant/turns', { text: 'cria um objetivo' });
        await drain(viewer);
        const viewerTools: string[] = toolNamesOf(requests[0] as LlmDriverCall);
        requests = [];
        llm.enqueue('ok');
        await harness.call(editor.token, 'POST', '/assistant/turns', { text: 'cria um objetivo' });
        await drain(editor);
        const editorTools: string[] = toolNamesOf(requests[0] as LlmDriverCall);

        expect(WRITE_TOOLS.every((tool: string): boolean => ownerTools.includes(tool))).toBe(true);
        expect(WRITE_TOOLS.every((tool: string): boolean => editorTools.includes(tool))).toBe(true);
        expect(WRITE_TOOLS.some((tool: string): boolean => viewerTools.includes(tool))).toBe(false);
        expect(viewerTools).toContain('help_search');
        const denied = await harness.call<ProblemBody>(viewer.token, 'POST', `/assistant/actions/${action.id}/confirm`, {});
        expect(denied.status).toBe(403);
        expect(await goalsOf(owner)).toBe(0);
    });

    it('a ação é de quem a pediu: outra pessoa da conta e outra conta recebem 404', async () => {
        const owner: Account = await premium('actions-private');
        const colleague: Account = await memberOf(owner, 'editor');
        const stranger: Account = await premium('actions-stranger');
        const action: ActionSummary = await propose(owner, 'goal_create', GOAL_INPUT);

        for (const outsider of [colleague, stranger]) {
            const read = await harness.call<ProblemBody>(outsider.token, 'GET', `/assistant/actions/${action.id}`);
            const confirm = await harness.call<ProblemBody>(outsider.token, 'POST', `/assistant/actions/${action.id}/confirm`, {});
            const cancel = await harness.call<ProblemBody>(outsider.token, 'POST', `/assistant/actions/${action.id}/cancel`);
            expect([read.status, confirm.status, cancel.status]).toEqual([404, 404, 404]);
            expect(confirm.body.type).toBe('assistant.action_not_found');
        }
        expect(await goalsOf(owner)).toBe(0);
        expect(await goalsOf(stranger)).toBe(0);
    });

    describe('categorizar transação', () => {
        async function withTransaction(owner: Account): Promise<void> {
            const accounts: FinancialAccountService = harness.app.get(FinancialAccountService, { strict: false });
            const ingestion: TransactionIngestionService = harness.app.get(TransactionIngestionService, { strict: false });
            const created = await harness.inCompany(owner.company.id, async () =>
                accounts.upsertProviderAccount({
                    provider: 'pluggy',
                    externalId: `acc-${crypto.randomUUID()}`,
                    kind: 'checking',
                    name: 'Conta de teste',
                    institutionName: 'Banco de teste',
                    numberLast4: '1234',
                    currency: 'BRL'
                })
            );
            await harness.inCompany(owner.company.id, async () =>
                ingestion.ingest({
                    accountId: created.id,
                    source: 'pluggy',
                    importId: null,
                    items: [
                        {
                            externalId: `pluggy:${crypto.randomUUID()}`,
                            date: TODAY,
                            amountMinor: -8_990,
                            currency: 'BRL',
                            description: MERCHANT_DESCRIPTION,
                            counterpartyName: null,
                            counterpartyDocument: null,
                            providerCategoryId: null
                        }
                    ]
                })
            );
        }

        it('a pessoa escolhe a transação no cartão, a descrição não vai ao modelo e o "sempre para" cria a regra', async () => {
            const owner: Account = await premium('actions-categorize');
            await withTransaction(owner);
            const action: ActionSummary = await propose(
                owner,
                'transaction_categorize',
                { categoryKey: 'eating_out', always: true, search: 'zebra' },
                'a compra do mercado zebra é delivery, sempre'
            );

            const card = await harness.call<ActionBody>(owner.token, 'GET', `/assistant/actions/${action.id}`);
            const missing = await harness.call<ProblemBody>(owner.token, 'POST', `/assistant/actions/${action.id}/confirm`, {});
            const picked = card.body.candidates[0];
            const confirmed = await harness.call<ActionSummary>(owner.token, 'POST', `/assistant/actions/${action.id}/confirm`, {
                transactionId: picked?.id,
                version: picked?.version
            });

            expect(card.body.candidates).toHaveLength(1);
            expect(card.body.candidates[0]?.description).toContain('ZEBRA');
            expect(JSON.stringify(requests.map((call: LlmDriverCall) => call.request))).not.toContain(MERCHANT_DESCRIPTION);
            expect(action.summary).not.toContain('ZEBRA');
            expect(missing.status).toBe(400);
            expect(missing.body.type).toBe('assistant.action_choice_invalid');
            expect(confirmed.body.status).toBe('confirmed');
            expect(confirmed.body.resultText).toContain('categorizada');
            expect(
                await count(`SELECT count(*)::int AS total FROM "Transactions" WHERE "companyId" = $1 AND "categorySource" = 'user'`, [
                    owner.company.id
                ])
            ).toBe(1);
            expect(await count('SELECT count(*)::int AS total FROM "CategoryRules" WHERE "companyId" = $1', [owner.company.id])).toBe(1);
        });

        it('a transação mudou depois do cartão: versão velha dá 409 stale e nada é gravado', async () => {
            const owner: Account = await premium('actions-categorize-stale');
            await withTransaction(owner);
            const action: ActionSummary = await propose(owner, 'transaction_categorize', { categoryKey: 'eating_out', search: 'zebra' });
            const card = await harness.call<ActionBody>(owner.token, 'GET', `/assistant/actions/${action.id}`);
            const picked = card.body.candidates[0];
            await harness.pg.query(`UPDATE "Transactions" SET "updatedAt" = now() + interval '1 minute' WHERE "companyId" = $1`, [
                owner.company.id
            ]);

            const stale = await harness.call<ProblemBody>(owner.token, 'POST', `/assistant/actions/${action.id}/confirm`, {
                transactionId: picked?.id,
                version: picked?.version
            });

            expect(stale.status).toBe(409);
            expect(stale.body.type).toBe('assistant.confirmation_stale');
            expect(
                await count(`SELECT count(*)::int AS total FROM "Transactions" WHERE "companyId" = $1 AND "categorySource" = 'user'`, [
                    owner.company.id
                ])
            ).toBe(0);
        });
    });
});
