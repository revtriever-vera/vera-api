import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LlmDriverCall } from '../../src/core/llm/drivers/llm-driver';
import { MockLlmDriver } from '../../src/core/llm/drivers/mock-llm.driver';
import { JsonObject, LlmContentBlock, LlmMessage, LlmToolUse } from '../../src/core/llm/llm.types';
import { QueueEnvelope } from '../../src/core/queue/queue.types';
import { AssistantTurnRequestedHandler } from '../../src/modules/assistant-chat/access/queue/assistant-turn.handler';
import { addDays } from '../../src/modules/fixed-income/domain/curve/business-days';
import { PlanContractService } from '../../src/modules/plans/services/plan-contract.service';
import { IncomingTransaction } from '../../src/modules/transactions/domain/transactions.types';
import { FinancialAccountService } from '../../src/modules/transactions/services/financial-account.service';
import { SpendingDataset, SpendingDatasetService } from '../../src/modules/transactions/services/spending-dataset.service';
import { TransactionIngestionService } from '../../src/modules/transactions/services/transaction-ingestion.service';
import { DateUtil } from '../../src/shared/utils/date.util';
import { Account, AllocationHarness } from './support/allocation-harness';
import { addPrototypePositions, seedPrototypeAssets, seedUsdRate } from './support/portfolio-seed';
import { CapturingPublisher, PublishedMessage } from './support/queue';

process.env['FIXED_INCOME_INDEX_DRIVER'] = 'mock';

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
const POISON_TITLE: string = 'CDB do Joao da Silva';
const POISON_TITLE_EMAIL: string = 'LCI maria@example.test';
const POISON_OTHER_COMPANY: string = 'CDB Concorrente Confidencial';
const POISON_UUID_PATTERN: RegExp = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

const READ_TOOLS: readonly string[] = [
    'concentration_overview',
    'contribution_suggestion',
    'fixed_income_maturities',
    'goals_overview',
    'help_search',
    'list_categories',
    'portfolio_overview',
    'recurring_overview',
    'spending_by_category',
    'spending_cuts',
    'spending_month_summary',
    'where_is'
];

interface StartedBody {
    readonly turnId: string;
    readonly conversationId: string;
}

interface TurnBody {
    readonly status: string;
    readonly answer?: { readonly text: string; readonly source: string; readonly sentAvailable: boolean; readonly notice: string | null };
}

interface SentBody {
    readonly sent: { readonly tool: string; readonly payload: unknown }[];
}

function toolUse(name: string, input: JsonObject = {}): LlmToolUse {
    return { toolUseId: `use-${name}`, name, input };
}

function resultsOf(request: { readonly messages: readonly LlmMessage[] }): string[] {
    return request.messages.flatMap((message: LlmMessage): string[] =>
        typeof message.content === 'string'
            ? []
            : message.content.flatMap((block: LlmContentBlock): string[] =>
                  block.kind === 'tool_result' && !block.isError ? [block.content] : []
              )
    );
}

describe('assistant chat: ferramentas de leitura no app', () => {
    const publisher: CapturingPublisher = new CapturingPublisher();
    let harness: AllocationHarness;
    let llm: MockLlmDriver;
    let dataset: SpendingDataset;
    let assetIds: Record<string, string>;
    let cursor: number = 0;
    let requests: LlmDriverCall[] = [];

    beforeAll(async () => {
        process.env['LLM_REPEAT_LIMIT'] = '1000';
        Object.assign(process.env, HOSTED_ENV);
        harness = await AllocationHarness.start('assistant_chat_tools', publisher);
        await seedUsdRate(harness);
        assetIds = await seedPrototypeAssets(harness);
        dataset = new SpendingDatasetService().build(TODAY);
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

    async function premium(label: string, withConsent: boolean = true): Promise<Account> {
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

    async function createTitle(account: Account, overrides: Record<string, unknown>): Promise<void> {
        const response = await harness.call(account.token, 'POST', '/fixed-income/titles', {
            kind: 'cdb',
            name: 'CDB',
            indexer: 'prefixed',
            rateBps: 1100,
            appliedMinor: 5_000_000,
            appliedAt: addDays(TODAY, -60),
            maturityDate: addDays(TODAY, 120),
            ...overrides
        });
        expect(response.status).toBe(201);
    }

    async function loadSpending(owner: Account): Promise<void> {
        const accounts: FinancialAccountService = harness.app.get(FinancialAccountService, { strict: false });
        const ingestion: TransactionIngestionService = harness.app.get(TransactionIngestionService, { strict: false });
        for (const spec of dataset.accounts) {
            const created = await harness.inCompany(owner.company.id, async () =>
                accounts.upsertProviderAccount({
                    provider: 'pluggy',
                    externalId: `acc-${spec.key}`,
                    kind: spec.kind,
                    name: spec.name,
                    institutionName: spec.institutionName,
                    numberLast4: spec.numberLast4,
                    currency: spec.currency
                })
            );
            const items: IncomingTransaction[] = dataset.transactions
                .filter((transaction) => transaction.accountKey === spec.key)
                .map((transaction) => ({
                    externalId: `pluggy:${transaction.key}`,
                    date: transaction.date,
                    amountMinor: transaction.amountMinor,
                    currency: 'BRL',
                    description: transaction.description,
                    counterpartyName: transaction.counterpartyName,
                    counterpartyDocument: transaction.counterpartyDocument,
                    providerCategoryId: transaction.providerCategoryId
                }));
            await harness.inCompany(owner.company.id, async () =>
                ingestion.ingest({ accountId: created.id, source: 'pluggy', importId: null, items })
            );
        }
    }

    async function richAccount(label: string): Promise<Account> {
        const account: Account = await premium(label);
        await addPrototypePositions(harness, account, assetIds);
        await createTitle(account, { issuerId: 'itau-unibanco', name: POISON_TITLE });
        await createTitle(account, { kind: 'lci', name: POISON_TITLE_EMAIL, maturityDate: addDays(TODAY, 200) });
        await loadSpending(account);
        return account;
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

    async function askWithTools(
        account: Account,
        text: string,
        tools: readonly LlmToolUse[],
        screenPath: string = '/portfolio'
    ): Promise<StartedBody> {
        llm.enqueue({ text: '', toolUses: tools });
        llm.enqueue('Sua carteira segue distribuída entre emissores e vencimentos.');
        const started = await harness.call<StartedBody>(account.token, 'POST', '/assistant/turns', { text, screen: { path: screenPath } });
        expect(started.status).toBe(202);
        await drain(account);
        return started.body;
    }

    async function turn(account: Account, id: string): Promise<TurnBody> {
        return (await harness.call<TurnBody>(account.token, 'GET', `/assistant/turns/${id}`)).body;
    }

    async function sentOf(account: Account, id: string): Promise<{ status: number; body: SentBody }> {
        return harness.call<SentBody>(account.token, 'GET', `/assistant/turns/${id}/sent`);
    }

    function toolNamesOf(call: LlmDriverCall): string[] {
        return (call.request.tools ?? []).map((tool) => tool.name).sort();
    }

    it('modo help só oferece as ferramentas de ajuda; modo ai oferece as de leitura, sem agenda nem lembrete', async () => {
        const free: Account = await harness.signUp('tools-free');
        const withoutConsent: Account = await premium('tools-no-consent', false);
        const withConsent: Account = await premium('tools-consent');

        await askWithTools(free, 'como vejo meus números?', [toolUse('help_search', { query: 'números' })]);
        const freeTools: string[] = toolNamesOf(requests[0] as LlmDriverCall);
        requests = [];
        await askWithTools(withoutConsent, 'como vejo meus números?', [toolUse('help_search', { query: 'números' })]);
        const withoutTools: string[] = toolNamesOf(requests[0] as LlmDriverCall);
        requests = [];
        await askWithTools(withConsent, 'como vejo meus números?', [toolUse('help_search', { query: 'números' })]);
        const withTools: string[] = toolNamesOf(requests[0] as LlmDriverCall);

        expect(freeTools).toEqual(['data_locked', 'help_search', 'where_is']);
        expect(withoutTools).toEqual(['data_locked', 'help_search', 'where_is']);
        expect(withTools).toEqual(READ_TOOLS);
    });

    it('turno em ai: concentração e vencimentos vão ao modelo, o aviso de investimento sai, e sent é o que a requisição levou', async () => {
        const owner: Account = await richAccount('tools-sent');

        const started: StartedBody = await askWithTools(
            owner,
            'como está minha concentração e o que vence?',
            [
                toolUse('concentration_overview'),
                toolUse('fixed_income_maturities', { months: 12 }),
                toolUse('portfolio_overview'),
                toolUse('spending_month_summary', { month: dataset.closedMonth })
            ],
            '/portfolio/contribution'
        );

        const answered: TurnBody = await turn(owner, started.turnId);
        expect(answered).toMatchObject({ status: 'done', answer: { source: 'ai', sentAvailable: true } });
        expect(answered.answer?.notice).toContain('Isto não é uma recomendação');
        const sent = await sentOf(owner, started.turnId);
        expect(sent.status).toBe(200);
        expect(sent.body.sent.map((item) => item.tool)).toEqual([
            'concentration_overview',
            'fixed_income_maturities',
            'portfolio_overview',
            'spending_month_summary'
        ]);
        const finalRequest: LlmDriverCall = requests.at(-1) as LlmDriverCall;
        expect(sent.body.sent.map((item) => JSON.stringify(item.payload))).toEqual(resultsOf(finalRequest.request));
        const concentration = sent.body.sent[0]?.payload as { por_emissor: { emissor: string }[] };
        expect(concentration.por_emissor.map((row) => row.emissor)).toContain('Itaú Unibanco');
        const maturities = sent.body.sent[1]?.payload as { por_tipo: { tipo: string }[] };
        expect(maturities.por_tipo.map((row) => row.tipo)).toEqual(['cdb', 'lci']);
        expect(JSON.stringify(finalRequest.request.system)).toContain('A pessoa está em Onde aportar');
    });

    it('fixtures envenenadas (nome de título, e-mail, descrição, contraparte, uuid, ativo) não aparecem em requisição nenhuma', async () => {
        const owner: Account = await richAccount('tools-poison');
        const other: Account = await richAccount('tools-poison-other');
        await createTitle(other, { name: POISON_OTHER_COMPANY, issuerId: 'bradesco' });

        await askWithTools(owner, 'resumo geral dos meus números', [
            toolUse('concentration_overview'),
            toolUse('fixed_income_maturities'),
            toolUse('portfolio_overview'),
            toolUse('contribution_suggestion', { amountMinor: 500_000 }),
            toolUse('spending_cuts'),
            toolUse('list_categories')
        ]);

        const everything: string = requests.map((call: LlmDriverCall): string => JSON.stringify(call.request)).join('\n');
        const descriptions: string[] = dataset.transactions.flatMap((transaction) => [
            transaction.description,
            transaction.counterpartyName ?? '',
            transaction.counterpartyDocument ?? ''
        ]);
        const symbols: string[] = Object.keys(assetIds).filter((symbol: string): boolean => symbol.length >= 4);
        const poison: string[] = [
            POISON_TITLE,
            'Joao da Silva',
            POISON_TITLE_EMAIL,
            'maria@example.test',
            POISON_OTHER_COMPANY,
            ...descriptions.filter((value: string): boolean => value.length >= 6),
            ...symbols
        ];
        expect(requests.length).toBeGreaterThan(1);
        poison.forEach((value: string): void => {
            expect(everything, value).not.toContain(value);
        });
        const payloads: string = resultsOf((requests.at(-1) as LlmDriverCall).request).join('\n');
        expect(POISON_UUID_PATTERN.test(payloads)).toBe(false);
        expect(payloads).not.toContain('Bradesco');
    });

    it('desligar a permissão no meio da conversa: o sent é apagado e o próximo turno volta a help, sem ferramenta de número', async () => {
        const owner: Account = await richAccount('tools-revoke');
        const first: StartedBody = await askWithTools(owner, 'como está minha carteira?', [toolUse('portfolio_overview')]);
        expect((await sentOf(owner, first.turnId)).body.sent).toHaveLength(1);

        const revoked = await harness.call(owner.token, 'DELETE', '/ai/consent');
        expect(revoked.status).toBe(204);

        expect((await sentOf(owner, first.turnId)).body.sent).toEqual([]);
        expect((await turn(owner, first.turnId)).answer?.sentAvailable).toBe(false);
        requests = [];
        const second: StartedBody = await askWithTools(owner, 'e agora?', [toolUse('help_search', { query: 'carteira' })]);
        expect((await turn(owner, second.turnId)).answer?.source).toBe('help');
        expect(toolNamesOf(requests[0] as LlmDriverCall)).toEqual(['data_locked', 'help_search', 'where_is']);
        const features = await harness.pg.query<{ feature: string }>(
            'SELECT DISTINCT "feature" FROM "LlmCalls" WHERE "companyId" = $1 ORDER BY "feature"',
            [owner.company.id]
        );
        expect(features.rows.map((row) => row.feature)).toEqual(['ai', 'help']);
    });

    it('duas companies: o sent é só de quem perguntou, e as ferramentas leem só a própria conta', async () => {
        const owner: Account = await richAccount('tools-tenant-a');
        const other: Account = await premium('tools-tenant-b');
        await createTitle(other, { name: 'CDB B', issuerId: 'bradesco', maturityDate: addDays(TODAY, 90) });
        const started: StartedBody = await askWithTools(owner, 'concentração?', [toolUse('concentration_overview')]);
        const otherStarted: StartedBody = await askWithTools(other, 'concentração?', [toolUse('concentration_overview')]);

        const foreign = await sentOf(other, started.turnId);
        const own = await sentOf(other, otherStarted.turnId);

        expect(foreign.status).toBe(404);
        const issuers: string[] = (own.body.sent[0]?.payload as { por_emissor: { emissor: string }[] }).por_emissor.map(
            (row) => row.emissor
        );
        expect(issuers).toEqual(['Bradesco']);
        const mine: string[] = (
            (await sentOf(owner, started.turnId)).body.sent[0]?.payload as { por_emissor: { emissor: string }[] }
        ).por_emissor.map((row) => row.emissor);
        expect(mine).not.toContain('Bradesco');
    });

    it('turno em help devolve sent vazio', async () => {
        const free: Account = await harness.signUp('tools-help-sent');
        const started: StartedBody = await askWithTools(free, 'onde vejo meus gastos?', [toolUse('where_is', { topic: 'gastos' })]);

        const sent = await sentOf(free, started.turnId);

        expect(sent.status).toBe(200);
        expect(sent.body).toEqual({ sent: [] });
    });
});
