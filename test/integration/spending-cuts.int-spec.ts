import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DateUtil } from '../../src/shared/utils/date.util';
import { FinancialAccountService } from '../../src/modules/transactions/services/financial-account.service';
import { SpendingDatasetService, SpendingDataset } from '../../src/modules/transactions/services/spending-dataset.service';
import { TransactionIngestionService } from '../../src/modules/transactions/services/transaction-ingestion.service';
import { IncomingTransaction } from '../../src/modules/transactions/domain/transactions.types';
import { Account, AllocationHarness } from './support/allocation-harness';

interface SuggestionBody {
    readonly categoryId: string;
    readonly systemKey: string | null;
    readonly spentMinor: number;
    readonly averageMinor: number | null;
    readonly excessMinor: number;
    readonly cutMinor: number;
    readonly limitMinor: number;
}

interface CutsBody {
    readonly month: string;
    readonly limitMonth: string;
    readonly isPartial: boolean;
    readonly status: string;
    readonly goal: { bps: number; minor: number; simulated: boolean };
    readonly incomeMinor: number;
    readonly savedMinor: number;
    readonly gapMinor: number;
    readonly surplusMinor: number;
    readonly totalCutMinor: number;
    readonly flexibleTotalMinor: number;
    readonly excessTotalMinor: number;
    readonly categoriesWithCut: number;
    readonly uncategorizedMinor: number;
    readonly averageMonths: number;
    readonly suggestions: SuggestionBody[];
}

interface SettingsBody {
    readonly savingsGoalBps: number;
}

interface CategoryBody {
    readonly id: string;
    readonly systemKey: string | null;
}

interface ProblemBody {
    readonly type: string;
}

function cutsBySystemKey(body: CutsBody): Record<string, number> {
    return Object.fromEntries(body.suggestions.map((item: SuggestionBody): [string, number] => [item.systemKey as string, item.cutMinor]));
}

describe('spending cuts', () => {
    let harness: AllocationHarness;
    let ingestion: TransactionIngestionService;
    let accounts: FinancialAccountService;
    let dataset: SpendingDataset;

    beforeAll(async () => {
        harness = await AllocationHarness.start('spending_cuts');
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

    async function category(owner: Account, systemKey: string): Promise<CategoryBody> {
        const list = await harness.call<{ categories: CategoryBody[] }>(owner.token, 'GET', '/spending/categories');
        return list.body.categories.find((item: CategoryBody): boolean => item.systemKey === systemKey) as CategoryBody;
    }

    async function cuts(owner: Account, query: string = ''): Promise<CutsBody> {
        const response = await harness.call<CutsBody>(owner.token, 'GET', `/spending/cuts${query}`);
        expect(response.status).toBe(200);
        return response.body;
    }

    it('meta gravada de 20% devolve o caso do protótipo, com Compras em primeiro', async () => {
        const owner: Account = await harness.signUp('cuts-canonical');
        await load(owner);

        const body: CutsBody = await cuts(owner);

        expect(body).toMatchObject({
            month: dataset.closedMonth,
            isPartial: false,
            status: 'cut_suggested',
            goal: { bps: 2000, minor: 560_000, simulated: false },
            incomeMinor: 2_800_000,
            savedMinor: 336_000,
            gapMinor: 224_000,
            surplusMinor: 0,
            totalCutMinor: 224_000,
            flexibleTotalMinor: 1_154_000,
            excessTotalMinor: 233_000,
            categoriesWithCut: 6,
            uncategorizedMinor: 80_000,
            averageMonths: 3
        });
        expect(body.limitMonth).toBe(dataset.currentMonth);
        expect(body.suggestions.map((item: SuggestionBody): string | null => item.systemKey)).toEqual([
            'shopping',
            'eating_out',
            'leisure',
            'groceries',
            'transport',
            'subscriptions'
        ]);
        expect(body.suggestions[0]).toMatchObject({
            spentMinor: 235_000,
            averageMinor: 160_000,
            excessMinor: 75_000,
            cutMinor: 72_103,
            limitMinor: 162_897
        });
        expect(cutsBySystemKey(body)).toEqual({
            shopping: 72_103,
            eating_out: 67_296,
            leisure: 48_069,
            groceries: 24_034,
            transport: 9_614,
            subscriptions: 2_884
        });
    });

    it('goalBps=3500 simula o caso de 35% sem alterar as preferências', async () => {
        const owner: Account = await harness.signUp('cuts-35');
        await load(owner);

        const body: CutsBody = await cuts(owner, '?goalBps=3500');
        const settings = await harness.call<SettingsBody>(owner.token, 'GET', '/spending/settings');

        expect(body).toMatchObject({ status: 'cut_suggested', gapMinor: 644_000, totalCutMinor: 644_000 });
        expect(body.goal).toEqual({ bps: 3500, minor: 980_000, simulated: true });
        expect(cutsBySystemKey(body)).toEqual({
            shopping: 158_696,
            eating_out: 157_257,
            groceries: 128_284,
            leisure: 117_669,
            transport: 56_300,
            subscriptions: 25_794
        });
        expect(settings.body.savingsGoalBps).toBe(2000);
    });

    it('goalBps=6000 excede o total flexível e corta tudo', async () => {
        const owner: Account = await harness.signUp('cuts-60');
        await load(owner);

        const body: CutsBody = await cuts(owner, '?goalBps=6000');

        expect(body).toMatchObject({ status: 'exceeds_flexible', gapMinor: 1_344_000, totalCutMinor: 1_154_000 });
        expect(body.suggestions.every((item: SuggestionBody): boolean => item.cutMinor === item.spentMinor && item.limitMinor === 0)).toBe(
            true
        );
    });

    it('goalBps=1000 está batida, com sobra de R$ 560,00 e cortes zero', async () => {
        const owner: Account = await harness.signUp('cuts-10');
        await load(owner);

        const body: CutsBody = await cuts(owner, '?goalBps=1000');

        expect(body).toMatchObject({ status: 'goal_met', gapMinor: 0, surplusMinor: 56_000, totalCutMinor: 0, categoriesWithCut: 0 });
        expect(body.suggestions).toHaveLength(6);
        expect(body.suggestions.every((item: SuggestionBody): boolean => item.cutMinor === 0 && item.limitMinor === item.spentMinor)).toBe(
            true
        );
    });

    it('a meta gravada em 35% vale sem goalBps', async () => {
        const owner: Account = await harness.signUp('cuts-saved');
        await load(owner);
        await harness.call(owner.token, 'PUT', '/spending/settings', { savingsGoalBps: 3500 });

        const body: CutsBody = await cuts(owner);

        expect(body.goal).toEqual({ bps: 3500, minor: 980_000, simulated: false });
        expect(body.totalCutMinor).toBe(644_000);
    });

    it('categorizar os dois Pix como Lazer muda a distribuição e mantém o corte total', async () => {
        const owner: Account = await harness.signUp('cuts-pix');
        await load(owner);
        const leisure: CategoryBody = await category(owner, 'leisure');
        const ids = await harness.pg.query<{ id: string }>(
            `SELECT "id" FROM "Transactions" WHERE "companyId" = $1 AND "externalId" LIKE $2 ORDER BY "externalId"`,
            [owner.company.id, `pluggy:${dataset.closedMonth}:%:pix-%`]
        );
        for (const item of ids.rows) {
            await harness.call(owner.token, 'PATCH', `/spending/transactions/${item.id}`, { categoryId: leisure.id });
        }

        const body: CutsBody = await cuts(owner);

        expect(body).toMatchObject({ gapMinor: 224_000, totalCutMinor: 224_000, uncategorizedMinor: 0 });
        expect(cutsBySystemKey(body)).toEqual({
            leisure: 93_035,
            shopping: 53_674,
            eating_out: 50_096,
            groceries: 17_891,
            transport: 7_157,
            subscriptions: 2_147
        });
    });

    it('trocar Lazer para fixa tira Lazer das sugestões e recalcula', async () => {
        const owner: Account = await harness.signUp('cuts-fixed');
        await load(owner);
        const leisure: CategoryBody = await category(owner, 'leisure');

        const changed = await harness.call(owner.token, 'PATCH', `/spending/categories/${leisure.id}`, { flexibility: 'fixed' });
        const body: CutsBody = await cuts(owner);

        expect(changed.status).toBe(200);
        expect(body.suggestions.map((item: SuggestionBody): string | null => item.systemKey)).not.toContain('leisure');
        expect(body).toMatchObject({
            status: 'cut_suggested',
            flexibleTotalMinor: 964_000,
            excessTotalMinor: 183_000,
            totalCutMinor: 224_000
        });
        expect(body.suggestions.reduce((sum: number, item: SuggestionBody): number => sum + item.cutMinor, 0)).toBe(224_000);
    });

    it('mês corrente é parcial e o limite é do mês seguinte', async () => {
        const owner: Account = await harness.signUp('cuts-partial');
        await load(owner);

        const body: CutsBody = await cuts(owner, `?month=${dataset.currentMonth}`);

        expect(body).toMatchObject({ month: dataset.currentMonth, isPartial: true, status: 'no_income' });
        expect(body.suggestions).toEqual([]);
    });

    it('company sem dados recebe no_data', async () => {
        const owner: Account = await harness.signUp('cuts-empty');

        const body: CutsBody = await cuts(owner);

        expect(body).toMatchObject({ status: 'no_data', totalCutMinor: 0, suggestions: [] });
    });

    it('isolamento: a company B recebe no_data mesmo com a A cheia', async () => {
        const first: Account = await harness.signUp('cuts-tenant-a');
        const second: Account = await harness.signUp('cuts-tenant-b');
        await load(first);

        const other: CutsBody = await cuts(second, '?goalBps=3500');
        const own: CutsBody = await cuts(first);

        expect(other).toMatchObject({ status: 'no_data', suggestions: [], flexibleTotalMinor: 0 });
        expect(own.totalCutMinor).toBe(224_000);
    });

    it('mês inválido devolve 422, goalBps fora de 0 a 9000 devolve 400 e sem sessão 401', async () => {
        const owner: Account = await harness.signUp('cuts-invalid');
        const future = `${String(Number(dataset.currentMonth.slice(0, 4)) + 1)}-01`;

        const month = await harness.call<ProblemBody>(owner.token, 'GET', `/spending/cuts?month=${future}`);
        const statuses: number[] = [];
        for (const goal of ['9001', '-1', '10.5', 'abc']) {
            statuses.push((await harness.call<ProblemBody>(owner.token, 'GET', `/spending/cuts?goalBps=${goal}`)).status);
        }
        const accepted = await harness.call(owner.token, 'GET', '/spending/cuts?goalBps=9000');
        const anonymous = await harness.call(null, 'GET', '/spending/cuts');

        expect([month.status, month.body.type]).toEqual([422, 'summary.invalid_month']);
        expect(statuses).toEqual([400, 400, 400, 400]);
        expect(accepted.status).toBe(200);
        expect(anonymous.status).toBe(401);
    });
});
