import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DateUtil } from '../../src/shared/utils/date.util';
import { FinancialAccountService } from '../../src/modules/transactions/services/financial-account.service';
import { SpendingDatasetService, SpendingDataset } from '../../src/modules/transactions/services/spending-dataset.service';
import { TransactionIngestionService } from '../../src/modules/transactions/services/transaction-ingestion.service';
import { IncomingTransaction } from '../../src/modules/transactions/domain/transactions.types';
import { Account, AllocationHarness } from './support/allocation-harness';

interface RowBody {
    readonly categoryId: string;
    readonly systemKey: string | null;
    readonly spentMinor: number;
    readonly averageMinor: number | null;
    readonly deltaBps: number | null;
    readonly isNew: boolean;
    readonly transactionCount: number;
    readonly flexibility: string | null;
}

interface SummaryBody {
    readonly month: string;
    readonly isPartial: boolean;
    readonly hasData: boolean;
    readonly currency: string;
    readonly previousMonth: string | null;
    readonly nextMonth: string | null;
    readonly availableMonths: string[];
    readonly income: { minor: number; mode: string; fromTransactionsMinor: number };
    readonly expensesMinor: number;
    readonly uncategorizedMinor: number;
    readonly uncategorizedCount: number;
    readonly uncategorizedInflowMinor: number;
    readonly savedMinor: number;
    readonly savingsRateBps: number | null;
    readonly goal: { bps: number; minor: number };
    readonly gapMinor: number;
    readonly fixedMinor: number;
    readonly fixedShareBps: number | null;
    readonly flexibleMinor: number;
    readonly transfersOutMinor: number;
    readonly averageMonths: number;
    readonly excludedCurrencyCount: number;
    readonly categories: RowBody[];
    readonly incomeCategories: RowBody[];
}

interface SettingsBody {
    readonly savingsGoalBps: number;
    readonly incomeMode: string;
    readonly declaredIncomeMinor: number | null;
}

interface CategoryBody {
    readonly id: string;
    readonly systemKey: string | null;
}

interface ProblemBody {
    readonly type: string;
}

describe('spending summary', () => {
    let harness: AllocationHarness;
    let ingestion: TransactionIngestionService;
    let accounts: FinancialAccountService;
    let dataset: SpendingDataset;

    beforeAll(async () => {
        harness = await AllocationHarness.start('spending_summary');
        ingestion = harness.app.get(TransactionIngestionService, { strict: false });
        accounts = harness.app.get(FinancialAccountService, { strict: false });
        dataset = new SpendingDatasetService().build(DateUtil.localDateIn(DateUtil.BRAZIL_TIMEZONE));
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function load(owner: Account): Promise<void> {
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

    async function summary(owner: Account, query: string = ''): Promise<SummaryBody> {
        const response = await harness.call<SummaryBody>(owner.token, 'GET', `/spending/summary${query}`);
        expect(response.status).toBe(200);
        return response.body;
    }

    async function category(owner: Account, systemKey: string): Promise<CategoryBody> {
        const list = await harness.call<{ categories: CategoryBody[] }>(owner.token, 'GET', '/spending/categories');
        return list.body.categories.find((item: CategoryBody): boolean => item.systemKey === systemKey) as CategoryBody;
    }

    function row(body: SummaryBody, systemKey: string): RowBody {
        return body.categories.find((item: RowBody): boolean => item.systemKey === systemKey) as RowBody;
    }

    it('sem parâmetro devolve o último mês fechado com os números do conjunto canônico', async () => {
        const owner: Account = await harness.signUp('canonical');
        await load(owner);

        const body: SummaryBody = await summary(owner);

        expect(body).toMatchObject({
            month: dataset.closedMonth,
            isPartial: false,
            hasData: true,
            currency: 'BRL',
            nextMonth: dataset.currentMonth,
            expensesMinor: 2_464_000,
            uncategorizedMinor: 80_000,
            uncategorizedCount: 2,
            uncategorizedInflowMinor: 0,
            savedMinor: 336_000,
            savingsRateBps: 1200,
            goal: { bps: 2000, minor: 560_000 },
            gapMinor: 224_000,
            fixedMinor: 1_230_000,
            fixedShareBps: 4393,
            flexibleMinor: 1_154_000,
            transfersOutMinor: 1_200_000,
            averageMonths: 3,
            excludedCurrencyCount: 0
        });
        expect(body.income).toEqual({ minor: 2_800_000, mode: 'transactions', fromTransactionsMinor: 2_800_000 });
        expect(body.availableMonths).toEqual([dataset.currentMonth, dataset.closedMonth, ...[...dataset.historyMonths].reverse()]);
        expect(row(body, 'housing')).toMatchObject({ spentMinor: 770_000, averageMinor: 770_000, deltaBps: 0, flexibility: 'fixed' });
        expect(row(body, 'health')).toMatchObject({ spentMinor: 140_000, averageMinor: 138_000, deltaBps: 145 });
        expect(row(body, 'groceries')).toMatchObject({ spentMinor: 290_000, averageMinor: 265_000, deltaBps: 943 });
        expect(row(body, 'eating_out')).toMatchObject({ spentMinor: 245_000, averageMinor: 175_000, deltaBps: 4000, transactionCount: 3 });
        expect(row(body, 'shopping')).toMatchObject({ spentMinor: 235_000, averageMinor: 160_000, deltaBps: 4688 });
        expect(row(body, 'leisure')).toMatchObject({ spentMinor: 190_000, averageMinor: 140_000, deltaBps: 3571 });
        expect(row(body, 'transport')).toMatchObject({ deltaBps: 833 });
        expect(row(body, 'subscriptions')).toMatchObject({ deltaBps: 492 });
        expect(body.categories.map((item: RowBody): string | null => item.systemKey)).not.toContain('card_payment');
        expect(body.incomeCategories).toHaveLength(1);
        expect(body.incomeCategories[0]).toMatchObject({ systemKey: 'income', spentMinor: 2_800_000, averageMinor: null });
    });

    it('o mês corrente é parcial, com os gastos até agora e média dos três meses anteriores', async () => {
        const owner: Account = await harness.signUp('partial');
        await load(owner);

        const body: SummaryBody = await summary(owner, `?month=${dataset.currentMonth}`);

        expect(body).toMatchObject({ month: dataset.currentMonth, isPartial: true, nextMonth: null, previousMonth: dataset.closedMonth });
        expect(body.expensesMinor).toBe(7_430);
        expect(body.income.minor).toBe(0);
        expect(body.savingsRateBps).toBeNull();
        expect(row(body, 'subscriptions')).toMatchObject({ spentMinor: 5_590 });
        expect(row(body, 'transport')).toMatchObject({ spentMinor: 1_840 });
    });

    it('meta de 35% muda o resultado na hora e persiste', async () => {
        const owner: Account = await harness.signUp('goal');
        await load(owner);

        const first = await harness.call<SettingsBody>(owner.token, 'GET', '/spending/settings');
        const saved = await harness.call<SettingsBody>(owner.token, 'PUT', '/spending/settings', { savingsGoalBps: 3500 });
        const body: SummaryBody = await summary(owner);

        expect(first.body).toEqual({ savingsGoalBps: 2000, incomeMode: 'transactions', declaredIncomeMinor: null });
        expect(saved.body).toEqual({ savingsGoalBps: 3500, incomeMode: 'transactions', declaredIncomeMinor: null });
        expect(body.goal).toEqual({ bps: 3500, minor: 980_000 });
        expect(body.gapMinor).toBe(644_000);
    });

    it('categorizar os dois Pix como Lazer zera o sem categoria e mantém os gastos', async () => {
        const owner: Account = await harness.signUp('pix');
        await load(owner);
        const leisure: CategoryBody = await category(owner, 'leisure');
        const ids = await harness.pg.query<{ id: string }>(
            `SELECT "id" FROM "Transactions" WHERE "companyId" = $1 AND "externalId" LIKE $2 ORDER BY "externalId"`,
            [owner.company.id, `pluggy:${dataset.closedMonth}:%:pix-%`]
        );
        expect(ids.rows).toHaveLength(2);

        for (const item of ids.rows) {
            const done = await harness.call(owner.token, 'PATCH', `/spending/transactions/${item.id}`, { categoryId: leisure.id });
            expect(done.status).toBe(200);
        }
        const body: SummaryBody = await summary(owner);

        expect(row(body, 'leisure').spentMinor).toBe(270_000);
        expect(body.uncategorizedMinor).toBe(0);
        expect(body.uncategorizedCount).toBe(0);
        expect(body.expensesMinor).toBe(2_464_000);
        expect(body.savedMinor).toBe(336_000);
    });

    it('trocar Mercado para fixo move o valor entre fixos e flexíveis', async () => {
        const owner: Account = await harness.signUp('flex');
        await load(owner);
        const groceries: CategoryBody = await category(owner, 'groceries');

        const changed = await harness.call(owner.token, 'PATCH', `/spending/categories/${groceries.id}`, { flexibility: 'fixed' });
        const body: SummaryBody = await summary(owner);

        expect(changed.status).toBe(200);
        expect(body.fixedMinor).toBe(1_520_000);
        expect(body.flexibleMinor).toBe(864_000);
        expect(body.fixedShareBps).toBe(5429);
    });

    it('modo declarado usa a renda informada e guarda a das transações; voltar mantém o valor', async () => {
        const owner: Account = await harness.signUp('declared');
        await load(owner);

        const missing = await harness.call<ProblemBody>(owner.token, 'PUT', '/spending/settings', { incomeMode: 'declared' });
        const declared = await harness.call<SettingsBody>(owner.token, 'PUT', '/spending/settings', {
            incomeMode: 'declared',
            declaredIncomeMinor: 4_000_000
        });
        const body: SummaryBody = await summary(owner);
        const back = await harness.call<SettingsBody>(owner.token, 'PUT', '/spending/settings', { incomeMode: 'transactions' });

        expect([missing.status, missing.body.type]).toEqual([422, 'summary.declared_income_required']);
        expect(declared.body).toEqual({ savingsGoalBps: 2000, incomeMode: 'declared', declaredIncomeMinor: 4_000_000 });
        expect(body.income).toEqual({ minor: 4_000_000, mode: 'declared', fromTransactionsMinor: 2_800_000 });
        expect(body.savedMinor).toBe(1_536_000);
        expect(back.body).toEqual({ savingsGoalBps: 2000, incomeMode: 'transactions', declaredIncomeMinor: 4_000_000 });
    });

    it('company sem transação recebe a estrutura zerada com status 200', async () => {
        const owner: Account = await harness.signUp('empty');

        const body: SummaryBody = await summary(owner);

        expect(body).toMatchObject({
            hasData: false,
            expensesMinor: 0,
            savedMinor: 0,
            savingsRateBps: null,
            fixedShareBps: null,
            averageMonths: 0,
            availableMonths: [],
            categories: [],
            incomeCategories: []
        });
        expect(body.income).toEqual({ minor: 0, mode: 'transactions', fromTransactionsMinor: 0 });
    });

    it('mês inválido, futuro ou antes de 2000 devolve 422 summary.invalid_month', async () => {
        const owner: Account = await harness.signUp('invalid-month');
        const future = `${String(Number(dataset.currentMonth.slice(0, 4)) + 1)}-01`;

        for (const month of [future, '1999-12', '2026-13', 'setembro', '2026-9']) {
            const response = await harness.call<ProblemBody>(owner.token, 'GET', `/spending/summary?month=${month}`);
            expect([month, response.status, response.body.type]).toEqual([month, 422, 'summary.invalid_month']);
        }
    });

    it('rejeita meta fora de 0 a 9000, renda fracionária e campo desconhecido', async () => {
        const owner: Account = await harness.signUp('invalid-settings');

        for (const payload of [
            { savingsGoalBps: 9001 },
            { savingsGoalBps: -1 },
            { savingsGoalBps: 10.5 },
            { declaredIncomeMinor: 1.5 },
            { x: 1 }
        ]) {
            const response = await harness.call<ProblemBody>(owner.token, 'PUT', '/spending/settings', payload);
            expect([JSON.stringify(payload), response.status]).toEqual([JSON.stringify(payload), 400]);
        }
        const accepted = await harness.call<SettingsBody>(owner.token, 'PUT', '/spending/settings', { savingsGoalBps: 9000 });
        expect(accepted.body.savingsGoalBps).toBe(9000);
    });

    it('conta em outra moeda fica fora do resumo e é contada', async () => {
        const owner: Account = await harness.signUp('currency');
        await load(owner);
        const usd = await harness.inCompany(owner.company.id, async () =>
            accounts.upsertProviderAccount({
                provider: 'pluggy',
                externalId: 'acc-usd',
                kind: 'checking',
                name: 'Conta USD',
                currency: 'USD'
            })
        );
        await harness.inCompany(owner.company.id, async () =>
            ingestion.ingest({
                accountId: usd.id,
                source: 'pluggy',
                importId: null,
                items: [
                    {
                        externalId: 'pluggy:usd-1',
                        date: `${dataset.closedMonth}-10`,
                        amountMinor: -99_900,
                        currency: 'USD',
                        description: 'HOTEL'
                    }
                ]
            })
        );

        const body: SummaryBody = await summary(owner);

        expect(body.excludedCurrencyCount).toBe(1);
        expect(body.expensesMinor).toBe(2_464_000);
        expect(body.uncategorizedMinor).toBe(80_000);
    });

    it('isolamento: a company B vê o próprio resumo vazio e o PUT dela não altera a meta da A', async () => {
        const first: Account = await harness.signUp('tenant-a');
        const second: Account = await harness.signUp('tenant-b');
        await load(first);
        await harness.call(first.token, 'PUT', '/spending/settings', { savingsGoalBps: 4200 });

        const other: SummaryBody = await summary(second);
        await harness.call(second.token, 'PUT', '/spending/settings', { savingsGoalBps: 100 });
        const own: SummaryBody = await summary(first);
        const settings = await harness.call<SettingsBody>(first.token, 'GET', '/spending/settings');

        expect(other).toMatchObject({ hasData: false, expensesMinor: 0, categories: [] });
        expect(own.expensesMinor).toBe(2_464_000);
        expect(own.goal.bps).toBe(4200);
        expect(settings.body.savingsGoalBps).toBe(4200);
    });

    it('sem sessão devolve 401 em todas as rotas', async () => {
        const statuses: number[] = await Promise.all([
            harness.call(null, 'GET', '/spending/summary').then((response) => response.status),
            harness.call(null, 'GET', '/spending/settings').then((response) => response.status),
            harness.call(null, 'PUT', '/spending/settings', {}).then((response) => response.status)
        ]);

        expect(statuses).toEqual([401, 401, 401]);
    });
});
