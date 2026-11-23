import { afterAll, beforeAll, describe, expect, it, MockInstance, vi } from 'vitest';
import { LlmDriverCall } from '../../src/core/llm/drivers/llm-driver';
import { MockLlmDriver } from '../../src/core/llm/drivers/mock-llm.driver';
import { LlmLedgerService } from '../../src/core/llm/services/llm-ledger.service';
import { CapReachedError } from '../../src/core/usage/usage.errors';
import { SummariesApplication } from '../../src/modules/ai-assistant/application/summaries.application';
import { User } from '../../src/modules/identity/domain/identity.types';
import { UserDomain } from '../../src/modules/identity/domain/user.domain';
import { AuthTokens, SessionIssuerPort } from '../../src/modules/identity/ports/session-issuer.port';
import { PlanContractService } from '../../src/modules/plans/services/plan-contract.service';
import { IncomingTransaction } from '../../src/modules/transactions/domain/transactions.types';
import { FinancialAccountService } from '../../src/modules/transactions/services/financial-account.service';
import { SpendingDataset, SpendingDatasetService } from '../../src/modules/transactions/services/spending-dataset.service';
import { TransactionIngestionService } from '../../src/modules/transactions/services/transaction-ingestion.service';
import { DateUtil } from '../../src/shared/utils/date.util';
import { asRole } from '../support/as-role';
import { Account, AllocationHarness } from './support/allocation-harness';
import { addPrototypePositions, seedPrototypeAssets, seedUsdRate } from './support/portfolio-seed';
import { CapturingPublisher } from './support/queue';

interface SummaryBody {
    readonly kind: string;
    readonly period: string;
    readonly paragraphs: string[];
    readonly generatedAt: string;
    readonly cached: boolean;
    readonly stale: boolean;
    readonly source: string;
    readonly usage: { readonly state: string; readonly usedBps: number; readonly resetsAt: string };
}

interface ProblemBody {
    readonly type: string;
    readonly meta?: { readonly resetsAt?: string };
}

interface PayloadBody {
    readonly payload: {
        readonly renda: string;
        readonly gastos: string;
        readonly guardado: string;
        readonly gastos_por_categoria: { readonly chave: string }[];
    };
}

interface Rows {
    readonly total: number;
}

function summaryText(payload: PayloadBody['payload']): string {
    const first: string = payload.gastos_por_categoria[0]?.chave ?? 'x';
    return JSON.stringify({
        paragraphs: [
            `Entraram **${payload.renda}** e saíram ${payload.gastos}. Você guardou ${payload.guardado}.`,
            `A maior categoria foi [[cat:${first}]].`
        ]
    });
}

describe('resumos escritos pelo modelo', () => {
    let harness: AllocationHarness;
    let dataset: SpendingDataset;
    let mock: MockLlmDriver;
    let calls: MockInstance<MockLlmDriver['generate']>;
    let assetIds: Record<string, string>;

    beforeAll(async () => {
        process.env['LLM_REPEAT_LIMIT'] = '1000';
        harness = await AllocationHarness.start('ai_summaries', new CapturingPublisher());
        dataset = new SpendingDatasetService().build(DateUtil.localDateIn(DateUtil.BRAZIL_TIMEZONE));
        mock = harness.app.get(MockLlmDriver, { strict: false });
        calls = vi.spyOn(mock, 'generate');
        assetIds = await seedPrototypeAssets(harness);
        await seedUsdRate(harness);
    });

    afterAll(async () => {
        delete process.env['LLM_REPEAT_LIMIT'];
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

    async function addExpense(owner: Account): Promise<void> {
        const accounts: FinancialAccountService = harness.app.get(FinancialAccountService, { strict: false });
        const ingestion: TransactionIngestionService = harness.app.get(TransactionIngestionService, { strict: false });
        const template = dataset.transactions.find((item) => item.description === 'SMART FIT' && item.date >= `${dataset.closedMonth}-01`);
        const spec = dataset.accounts.find((item) => item.key === template?.accountKey);
        if (template === undefined || spec === undefined) {
            throw new Error('fixture without the expected transaction');
        }
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
        await harness.inCompany(owner.company.id, async () =>
            ingestion.ingest({
                accountId: created.id,
                source: 'pluggy',
                importId: null,
                items: [
                    {
                        externalId: 'pluggy:extra-expense',
                        date: template.date,
                        amountMinor: template.amountMinor * 3,
                        currency: 'BRL',
                        description: 'SMART FIT EXTRA',
                        counterpartyName: null,
                        counterpartyDocument: null,
                        providerCategoryId: template.providerCategoryId
                    }
                ]
            })
        );
    }

    async function monthPayload(owner: Account): Promise<PayloadBody> {
        return (await harness.call<PayloadBody>(owner.token, 'GET', `/ai/payload?kind=month&month=${dataset.closedMonth}`)).body;
    }

    async function englishToken(owner: Account): Promise<string> {
        await harness.pg.query('UPDATE "Users" SET "locale" = $1 WHERE "id" = $2', ['en', owner.user.id]);
        const users: UserDomain = harness.app.get(UserDomain, { strict: false });
        const issuer: SessionIssuerPort = harness.app.get(SessionIssuerPort, { strict: false });
        const user: User | null = await harness.inCompany(owner.company.id, async () => users.findById(owner.user.id));
        if (user === null) {
            throw new Error('owner not found');
        }
        const tokens: AuthTokens = await harness.inCompany(owner.company.id, async () =>
            issuer.issueForNewLogin(user, { ip: '203.0.113.9', userAgent: 'int-test' }, 'google', 'app')
        );
        return tokens.accessToken;
    }

    async function stored(owner: Account): Promise<number> {
        const rows = await harness.pg.query<Rows>('SELECT count(*)::int AS total FROM "AiSummaries" WHERE "companyId" = $1', [
            owner.company.id
        ]);
        return rows.rows[0]?.total ?? 0;
    }

    const month = (): string => `/ai/summaries/month?month=${dataset.closedMonth}`;

    it('GET month gera, grava e devolve com os nomes no lugar dos marcadores; o segundo GET vem do guardado', async () => {
        const owner: Account = await premium('sum-month');
        await loadSpending(owner);
        const payload: PayloadBody = await monthPayload(owner);
        mock.enqueue(summaryText(payload.payload));
        const before: number = calls.mock.calls.length;

        const first = await harness.call<SummaryBody>(owner.token, 'GET', month());
        const second = await harness.call<SummaryBody>(owner.token, 'GET', month());

        expect(first.status).toBe(200);
        expect(first.body).toMatchObject({ kind: 'month', period: dataset.closedMonth, cached: false, stale: false, source: 'model' });
        expect(first.body.paragraphs[0]).toContain(`**${payload.payload.renda}**`);
        expect(first.body.paragraphs[1]).not.toContain('[[');
        expect(first.body.usage).toMatchObject({ state: 'ok' });
        expect(second.body).toMatchObject({ cached: true, stale: false, paragraphs: first.body.paragraphs });
        expect(calls.mock.calls.length - before).toBe(1);
        expect(await stored(owner)).toBe(1);
    });

    it('o corpo que o modelo recebe é o mesmo JSON de GET /ai/payload do mesmo tipo e período', async () => {
        const owner: Account = await premium('sum-equal');
        await loadSpending(owner);
        const view = await monthPayload(owner);
        mock.enqueue(summaryText(view.payload));
        const before: number = calls.mock.calls.length;

        await harness.call(owner.token, 'GET', month());

        const sent: LlmDriverCall = calls.mock.calls[before]?.[0] as LlmDriverCall;
        expect(sent.request.messages).toEqual([{ role: 'user', content: JSON.stringify(view.payload) }]);
        expect(sent.request.task).toBe('summary_month');
        expect(JSON.stringify(sent.request)).not.toContain(owner.company.id);
    });

    it('transação nova muda o hash: stale dentro da hora e nova geração depois dela', async () => {
        const owner: Account = await premium('sum-stale');
        await loadSpending(owner);
        const view = await monthPayload(owner);
        mock.enqueue(summaryText(view.payload));
        const first = await harness.call<SummaryBody>(owner.token, 'GET', month());
        await addExpense(owner);

        const within = await harness.call<SummaryBody>(owner.token, 'GET', month());
        await harness.pg.query(`UPDATE "AiSummaries" SET "lastAutoGeneratedAt" = now() - interval '2 hours' WHERE "companyId" = $1`, [
            owner.company.id
        ]);
        const changed = await monthPayload(owner);
        mock.enqueue(summaryText(changed.payload));
        const after = await harness.call<SummaryBody>(owner.token, 'GET', month());

        expect(within.body).toMatchObject({ cached: true, stale: true, generatedAt: first.body.generatedAt });
        expect(after.body).toMatchObject({ cached: false, stale: false });
        expect(after.body.paragraphs[0]).toContain(changed.payload.gastos);
        expect(await stored(owner)).toBe(1);
    });

    it('regenerate gera mesmo com o hash igual e o sexto na hora é 429; leitura não escreve de novo', async () => {
        const owner: Account = await premium('sum-regen');
        await loadSpending(owner);
        const view = await monthPayload(owner);
        const viewer: Account = await asRole(harness, owner, 'viewer');
        const path: string = '/ai/summaries/month/regenerate';
        const body = { month: dataset.closedMonth };
        for (let index = 0; index < 6; index += 1) {
            mock.enqueue(summaryText(view.payload));
        }
        await harness.call(owner.token, 'GET', month());
        const before: number = calls.mock.calls.length;

        const denied = await harness.call<ProblemBody>(viewer.token, 'POST', path, body);
        const results: number[] = [];
        for (let index = 0; index < 5; index += 1) {
            results.push((await harness.call<SummaryBody>(owner.token, 'POST', path, body)).status);
        }
        const sixth = await harness.call<ProblemBody>(owner.token, 'POST', path, body);

        expect(denied.status).toBe(403);
        expect(results).toEqual([200, 200, 200, 200, 200]);
        expect(sixth.status).toBe(429);
        expect(calls.mock.calls.length - before).toBe(5);
        expect(await stored(owner)).toBe(1);
        const invalid = await harness.call<ProblemBody>(owner.token, 'POST', '/ai/summaries/cuts/regenerate', { extra: 1 });
        expect(invalid.status).toBe(400);
    });

    it('número inventado: segunda tentativa grava; duas reprovações: 502 e nada gravado', async () => {
        const owner: Account = await premium('sum-guard');
        await loadSpending(owner);
        const view = await monthPayload(owner);
        const invented: string = JSON.stringify({ paragraphs: ['Entraram R$ 987.654 neste mês.'] });
        const before: number = calls.mock.calls.length;
        mock.enqueue(invented);
        mock.enqueue(summaryText(view.payload));

        const recovered = await harness.call<SummaryBody>(owner.token, 'GET', month());
        const secondCall: LlmDriverCall = calls.mock.calls[before + 1]?.[0] as LlmDriverCall;

        expect(recovered.status).toBe(200);
        expect(calls.mock.calls.length - before).toBe(2);
        expect(secondCall.request.messages).toHaveLength(3);
        expect(await stored(owner)).toBe(1);

        const other: Account = await premium('sum-guard-fail');
        await loadSpending(other);
        mock.enqueue(invented);
        mock.enqueue(JSON.stringify({ paragraphs: ['Compre PETR4 agora!'] }));
        const failed = await harness.call<ProblemBody>(other.token, 'GET', month());

        expect(failed).toMatchObject({ status: 502, body: { type: 'ai.invalid_response' } });
        expect(await stored(other)).toBe(0);
    });

    it('cortes com a meta batida: texto fixo, sem chamada ao modelo e sem a permissão', async () => {
        const owner: Account = await premium('sum-fixed', false);
        await loadSpending(owner);
        const before: number = calls.mock.calls.length;

        const fixed = await harness.call<SummaryBody>(owner.token, 'GET', `/ai/summaries/cuts?month=${dataset.closedMonth}&goalBps=500`);
        const model = await harness.call<ProblemBody>(owner.token, 'GET', `/ai/summaries/cuts?month=${dataset.closedMonth}&goalBps=3000`);
        const noPermission = await harness.call<ProblemBody>(owner.token, 'GET', month());

        expect(fixed.status).toBe(200);
        expect(fixed.body).toMatchObject({ kind: 'cuts', source: 'fixed', cached: false, stale: false, period: dataset.closedMonth });
        expect(fixed.body.paragraphs[0]).toContain('Você já guarda mais que a meta de 5%');
        expect(model).toMatchObject({ status: 403, body: { type: 'ai.consent_required' } });
        expect(noPermission).toMatchObject({ status: 403, body: { type: 'ai.consent_required' } });
        expect(calls.mock.calls.length - before).toBe(0);
        expect(await stored(owner)).toBe(0);
    });

    it('cortes com a meta simulada gera pelo modelo e guarda por mês e meta', async () => {
        const owner: Account = await premium('sum-cuts');
        await loadSpending(owner);
        const view = (
            await harness.call<{ payload: { falta_por_mes: string; categorias_flexiveis: { chave: string; cortar: string }[] } }>(
                owner.token,
                'GET',
                `/ai/payload?kind=cuts&month=${dataset.closedMonth}&goalBps=3000`
            )
        ).body;
        const first = view.payload.categorias_flexiveis[0];
        mock.enqueue(
            JSON.stringify({
                paragraphs: [
                    `Faltam **${view.payload.falta_por_mes}** por mês.`,
                    `Comece por [[cat:${first?.chave ?? 'x'}]]: cortar ${first?.cortar ?? ''}.`
                ]
            })
        );

        const generated = await harness.call<SummaryBody>(
            owner.token,
            'GET',
            `/ai/summaries/cuts?month=${dataset.closedMonth}&goalBps=3000`
        );
        const rows = await harness.pg.query<{ periodKey: string }>('SELECT "periodKey" FROM "AiSummaries" WHERE "companyId" = $1', [
            owner.company.id
        ]);

        expect(generated.status).toBe(200);
        expect(generated.body).toMatchObject({ kind: 'cuts', source: 'model', period: dataset.closedMonth });
        expect(rows.rows).toEqual([{ periodKey: `${dataset.closedMonth}:3000` }]);
    });

    it('carteira: sem posições 204; com posições gera, guarda por dia e aceita o aporte planejado', async () => {
        const owner: Account = await premium('sum-portfolio');
        const empty = await harness.call(owner.token, 'GET', '/ai/summaries/portfolio');
        await addPrototypePositions(harness, owner, assetIds);
        const view = (
            await harness.call<{ payload: { total: string; exposicao_dolar_pct: string } }>(
                owner.token,
                'GET',
                '/ai/payload?kind=portfolio'
            )
        ).body;
        mock.enqueue(
            JSON.stringify({
                paragraphs: [`Sua carteira soma **${view.payload.total}**, com ${view.payload.exposicao_dolar_pct} em dólar.`]
            })
        );

        const generated = await harness.call<SummaryBody>(owner.token, 'GET', '/ai/summaries/portfolio');

        expect(empty.status).toBe(204);
        expect(generated.status).toBe(200);
        expect(generated.body).toMatchObject({
            kind: 'portfolio',
            source: 'model',
            period: DateUtil.localDateIn(DateUtil.BRAZIL_TIMEZONE)
        });
        expect(generated.body.paragraphs[0]).toContain(view.payload.total);
    });

    it('sem gastos 204; sem permissão 403; Free 402; cota pausada 429 com resetsAt', async () => {
        const free: Account = await harness.signUp('sum-free');
        const empty: Account = await premium('sum-empty');
        const noConsent: Account = await premium('sum-noconsent', false);
        await loadSpending(noConsent);
        const capped: Account = await premium('sum-capped');
        await loadSpending(capped);
        const resetsAt: string = '2026-12-01T03:00:00.000Z';
        const spy = vi
            .spyOn(harness.app.get(LlmLedgerService, { strict: false }), 'assertRoom')
            .mockRejectedValue(new CapReachedError('ai', resetsAt));

        const noData = await harness.call(empty.token, 'GET', month());
        const refused = await harness.call<ProblemBody>(noConsent.token, 'GET', month());
        const plan = await harness.call<ProblemBody>(free.token, 'GET', month());
        const paused = await harness.call<ProblemBody>(capped.token, 'GET', month());
        spy.mockRestore();

        expect(noData.status).toBe(204);
        expect(refused).toMatchObject({ status: 403, body: { type: 'ai.consent_required' } });
        expect(plan).toMatchObject({ status: 402, body: { type: 'billing.premium_required' } });
        expect(paused).toMatchObject({ status: 429, body: { type: 'usage.cap_reached', meta: { resetsAt } } });
        expect(await stored(capped)).toBe(0);
    });

    it('locale en gera e guarda separado do pt-BR', async () => {
        const owner: Account = await premium('sum-locale');
        await loadSpending(owner);
        const view = await monthPayload(owner);
        mock.enqueue(summaryText(view.payload));
        await harness.call(owner.token, 'GET', month());
        const token: string = await englishToken(owner);
        const payloadEn = (
            await harness.call<{ payload: PayloadBody['payload'] }>(token, 'GET', `/ai/payload?kind=month&month=${dataset.closedMonth}`)
        ).body.payload;
        mock.enqueue(summaryText(payloadEn));

        const generated = await harness.call<SummaryBody>(token, 'GET', month());
        const again = await harness.call<SummaryBody>(token, 'GET', month());
        const locales = await harness.pg.query<{ locale: string }>(
            'SELECT "locale" FROM "AiSummaries" WHERE "companyId" = $1 ORDER BY "locale"',
            [owner.company.id]
        );

        expect(generated.body.cached).toBe(false);
        expect(again.body.cached).toBe(true);
        expect(generated.body.paragraphs[0]).toContain(payloadEn.renda);
        expect(locales.rows.map((row) => row.locale)).toEqual(['en', 'pt-BR']);
    });

    it('duas companies: o resumo de A nunca é devolvido para B', async () => {
        const first: Account = await premium('sum-iso-a');
        const second: Account = await premium('sum-iso-b');
        await loadSpending(first);
        await loadSpending(second);
        const view = (
            await harness.call<{ payload: PayloadBody['payload'] }>(
                first.token,
                'GET',
                `/ai/payload?kind=month&month=${dataset.closedMonth}`
            )
        ).body;
        mock.enqueue(summaryText(view.payload));
        mock.enqueue(summaryText(view.payload));
        const before: number = calls.mock.calls.length;

        const forFirst = await harness.call<SummaryBody>(first.token, 'GET', month());
        const forSecond = await harness.call<SummaryBody>(second.token, 'GET', month());

        expect(forFirst.body.cached).toBe(false);
        expect(forSecond.body.cached).toBe(false);
        expect(calls.mock.calls.length - before).toBe(2);
        expect(await stored(first)).toBe(1);
        expect(await stored(second)).toBe(1);
    });

    it('desligar a permissão apaga os resumos; exportação inclui os textos; exclusão da conta apaga tudo', async () => {
        const owner: Account = await premium('sum-purge');
        await loadSpending(owner);
        const view = await monthPayload(owner);
        mock.enqueue(summaryText(view.payload));
        const generated = await harness.call<SummaryBody>(owner.token, 'GET', month());

        const exported = await harness.call<{ sections: Record<string, { kind: string; paragraphs: string[] }[]> }>(
            owner.token,
            'GET',
            '/account/export'
        );
        const revoked = await harness.call(owner.token, 'DELETE', '/ai/consent');

        expect(exported.body.sections['ai_summaries']?.[0]).toMatchObject({ kind: 'month', paragraphs: generated.body.paragraphs });
        expect(revoked.status).toBe(204);
        expect(await stored(owner)).toBe(0);

        await harness.call(owner.token, 'PUT', '/ai/consent', { noticeVersion: 1, source: 'summary_card' });
        mock.enqueue(summaryText(view.payload));
        await harness.call(owner.token, 'GET', month());
        const removed = await harness.call(owner.token, 'DELETE', '/account', { confirmEmail: owner.user.email });
        expect(removed.status).toBe(204);
        expect(await stored(owner)).toBe(0);
    });

    it('a retenção apaga só os textos com mais de 13 meses', async () => {
        const owner: Account = await premium('sum-retention');
        await loadSpending(owner);
        const view = await monthPayload(owner);
        mock.enqueue(summaryText(view.payload));
        await harness.call(owner.token, 'GET', month());
        await harness.pg.query(
            `INSERT INTO "AiSummaries" ("id","companyId","kind","periodKey","locale","contextHash","paragraphs","source","promptVersion","generatedAt")
             VALUES ($1,$2,'month','2025-01','pt-BR','old','["antigo"]','model',1, now() - interval '14 months')`,
            [crypto.randomUUID(), owner.company.id]
        );

        const purged: number = await harness.app.get(SummariesApplication, { strict: false }).purgeExpired();

        expect(purged).toBeGreaterThanOrEqual(1);
        expect(await stored(owner)).toBe(1);
    });
});
