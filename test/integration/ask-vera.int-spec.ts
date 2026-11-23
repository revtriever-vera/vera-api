import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MockLlmDriver } from '../../src/core/llm/drivers/mock-llm.driver';
import { LlmLedgerService } from '../../src/core/llm/services/llm-ledger.service';
import { CapReachedError } from '../../src/core/usage/usage.errors';
import { AskVeraAnswer } from '../../src/modules/ai-assistant/domain/ask-vera.types';
import { AskVeraService } from '../../src/modules/ai-assistant/services/ask-vera.service';
import { SpendingByCategoryTool } from '../../src/modules/ai-assistant/services/tools/spending-by-category.tool';
import { SpendingMonthSummaryTool } from '../../src/modules/ai-assistant/services/tools/spending-month-summary.tool';
import { PortfolioOverviewTool } from '../../src/modules/ai-assistant/services/tools/portfolio-overview.tool';
import { PlanContractService } from '../../src/modules/plans/services/plan-contract.service';
import { IncomingTransaction } from '../../src/modules/transactions/domain/transactions.types';
import { FinancialAccountService } from '../../src/modules/transactions/services/financial-account.service';
import { SpendingDataset, SpendingDatasetService } from '../../src/modules/transactions/services/spending-dataset.service';
import { TransactionIngestionService } from '../../src/modules/transactions/services/transaction-ingestion.service';
import { DateUtil } from '../../src/shared/utils/date.util';
import { Account, AllocationHarness } from './support/allocation-harness';
import { CapturingPublisher } from './support/queue';

const HOSTED_ENV: Record<string, string> = {
    DEPLOYMENT_MODE: 'hosted',
    WHATSAPP_ACCESS_TOKEN: 'hosted-token-1a2b3c4d5e6f',
    WHATSAPP_PHONE_NUMBER_ID: '104857600000099',
    WHATSAPP_VERIFY_TOKEN: 'hosted-verify-1a2b3c4d',
    WHATSAPP_APP_SECRET: 'hosted-app-secret-1a2b3c4d',
    WHATSAPP_WABA_ID: '200000000000099',
    WHATSAPP_DISPLAY_NUMBER: '+55 11 4000-0000'
};

interface CallRow {
    readonly feature: string;
    readonly referenceId: string | null;
}

describe('AskVeraService', () => {
    let harness: AllocationHarness;
    let dataset: SpendingDataset;
    let service: AskVeraService;
    let mock: MockLlmDriver;

    beforeAll(async () => {
        process.env['LLM_REPEAT_LIMIT'] = '1000';
        Object.assign(process.env, HOSTED_ENV);
        harness = await AllocationHarness.start('ask_vera', new CapturingPublisher());
        dataset = new SpendingDatasetService().build(DateUtil.localDateIn(DateUtil.BRAZIL_TIMEZONE));
        service = harness.app.get(AskVeraService, { strict: false });
        mock = harness.app.get(MockLlmDriver, { strict: false });
    });

    afterAll(async () => {
        delete process.env['LLM_REPEAT_LIMIT'];
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

    async function ask(owner: Account, text: string, messageId: string): Promise<AskVeraAnswer> {
        return harness.inCompany(owner.company.id, async () => service.ask({ text, history: [], locale: 'pt-BR', messageId }));
    }

    async function calls(owner: Account): Promise<CallRow[]> {
        const rows = await harness.pg.query<CallRow>(
            'SELECT "feature", "referenceId" FROM "LlmCalls" WHERE "companyId" = $1 ORDER BY "referenceId"',
            [owner.company.id]
        );
        return rows.rows;
    }

    async function monthPayload(owner: Account): Promise<{ renda: string; gastos: string }> {
        const tool: SpendingMonthSummaryTool = harness.app.get(SpendingMonthSummaryTool, { strict: false });
        const output = await harness.inCompany(owner.company.id, async () => tool.run({ month: dataset.closedMonth }));
        return output.payload as unknown as { renda: string; gastos: string };
    }

    it('chama a ferramenta, responde com o número conferido e grava cada passo como whatsapp', async () => {
        const owner: Account = await premium('ask-tool');
        await loadSpending(owner);
        const payload = await monthPayload(owner);
        mock.enqueue({ text: '', toolUses: [{ toolUseId: 'u1', name: 'spending_month_summary', input: { month: dataset.closedMonth } }] });
        mock.enqueue(`Entraram **${payload.renda}** no mês.`);

        const answer: AskVeraAnswer = await ask(owner, 'quanto entrou em setembro?', 'msg-tool');

        expect(answer).toMatchObject({ source: 'model', toolsUsed: ['spending_month_summary'], truncated: false, proposals: [] });
        expect(answer.text).toBe(`Entraram *${payload.renda}* no mês.`);
        expect(answer.usage.state).toBe('ok');
        expect(await calls(owner)).toEqual([
            { feature: 'whatsapp', referenceId: 'ask:msg-tool:1' },
            { feature: 'whatsapp', referenceId: 'ask:msg-tool:2' }
        ]);
    });

    it('recusa Pix e responde à saudação sem modelo e sem gravar chamada', async () => {
        const owner: Account = await premium('ask-fixed', false);

        const pix: AskVeraAnswer = await ask(owner, 'faz um Pix de R$ 50 pra Maria', 'msg-pix');
        const hello: AskVeraAnswer = await ask(owner, 'oi', 'msg-hi');

        expect(pix).toMatchObject({ source: 'fixed', text: expect.stringContaining('A Vera não faz Pix') });
        expect(hello).toMatchObject({ source: 'fixed', text: expect.stringContaining('Pergunte sobre a carteira') });
        expect(await calls(owner)).toEqual([]);
    });

    it('sem permissão: ai.consent_required; Free: billing.premium_required', async () => {
        const noConsent: Account = await premium('ask-noconsent', false);
        const free: Account = await harness.signUp('ask-free');

        await expect(ask(noConsent, 'quanto gastei?', 'm1')).rejects.toMatchObject({ code: 'ai.consent_required' });
        await expect(ask(free, 'quanto gastei?', 'm2')).rejects.toMatchObject({ code: 'billing.premium_required' });
        expect(await calls(noConsent)).toEqual([]);
    });

    it('cota estourada no segundo passo: usage.cap_reached e o segundo passo registrado como recusado', async () => {
        const owner: Account = await premium('ask-cap');
        await loadSpending(owner);
        mock.enqueue({ text: '', toolUses: [{ toolUseId: 'u1', name: 'spending_month_summary', input: { month: dataset.closedMonth } }] });
        const ledger: LlmLedgerService = harness.app.get(LlmLedgerService, { strict: false });
        const resetsAt: string = '2026-12-01T03:00:00.000Z';
        const spy = vi
            .spyOn(ledger, 'assertRoom')
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new CapReachedError('whatsapp', resetsAt));

        await expect(ask(owner, 'quanto gastei?', 'msg-cap')).rejects.toMatchObject({ code: 'usage.cap_reached' });
        spy.mockRestore();

        const rows = await harness.pg.query<{ referenceId: string; outcome: string }>(
            'SELECT "referenceId", "outcome" FROM "LlmCalls" WHERE "companyId" = $1 ORDER BY "referenceId"',
            [owner.company.id]
        );
        expect(rows.rows).toEqual([
            { referenceId: 'ask:msg-cap:1', outcome: 'answered' },
            { referenceId: 'ask:msg-cap:2', outcome: 'cap_reached' }
        ]);
    });

    it('duas companies: as ferramentas de uma nunca leem dado da outra', async () => {
        const first: Account = await premium('ask-a');
        const second: Account = await premium('ask-b');
        await loadSpending(first);
        const byCategory: SpendingByCategoryTool = harness.app.get(SpendingByCategoryTool, { strict: false });
        const portfolio: PortfolioOverviewTool = harness.app.get(PortfolioOverviewTool, { strict: false });
        const input = { fromMonth: dataset.closedMonth, toMonth: dataset.closedMonth };

        const mine = await harness.inCompany(first.company.id, async () => byCategory.run(input));
        const theirs = await harness.inCompany(second.company.id, async () => byCategory.run(input));
        const month = await harness.inCompany(second.company.id, async () =>
            harness.app.get(SpendingMonthSummaryTool, { strict: false }).run({ month: dataset.closedMonth })
        );
        const holdings = await harness.inCompany(second.company.id, async () => portfolio.run());

        expect((mine.payload['categorias'] as unknown[]).length).toBeGreaterThan(0);
        expect(theirs.payload['categorias']).toEqual([]);
        expect(month.payload).toEqual({ status: 'no_data' });
        expect(holdings.payload).toEqual({ status: 'no_portfolio' });
    });
});
