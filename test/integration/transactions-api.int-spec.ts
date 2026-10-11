import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FinancialAccountService } from '../../src/modules/transactions/services/financial-account.service';
import { TransactionIngestionService } from '../../src/modules/transactions/services/transaction-ingestion.service';
import { IncomingTransaction } from '../../src/modules/transactions/domain/transactions.types';
import { Account, AllocationHarness } from './support/allocation-harness';

interface CategoryBody {
    readonly id: string;
    readonly systemKey: string | null;
    readonly kind: string;
}

interface TransactionBody {
    readonly id: string;
    readonly accountName: string;
    readonly date: string;
    readonly amountMinor: number;
    readonly description: string;
    readonly categoryId: string | null;
    readonly categorySource: string;
    readonly ruleId: string | null;
    readonly source: string;
}

interface ListBody {
    readonly data: TransactionBody[];
    readonly pagination: { page: number; pageSize: number; totalRecords: number; totalPages: number };
    readonly totals: { inMinor: number; outMinor: number; count: number };
}

interface SavedBody {
    readonly transaction: TransactionBody;
    readonly rule: { id: string; matchType: string; label: string; appliesTo: string; categoryId: string } | null;
    readonly recategorized: number;
}

interface ProblemBody {
    readonly type: string;
}

interface AccountBody {
    readonly id: string;
    readonly name: string;
    readonly source: string;
    readonly transactionCount: number;
    readonly lastTransactionDate: string | null;
}

const MARIA_DOCUMENT: string = '00000000191';

function item(
    externalId: string,
    date: string,
    amountMinor: number,
    description: string,
    extra: Partial<IncomingTransaction> = {}
): IncomingTransaction {
    return { externalId, date, amountMinor, currency: 'BRL', description, ...extra };
}

describe('transactions api', () => {
    let harness: AllocationHarness;
    let ingestion: TransactionIngestionService;
    let accounts: FinancialAccountService;

    beforeAll(async () => {
        harness = await AllocationHarness.start('transactions_api');
        ingestion = harness.app.get(TransactionIngestionService, { strict: false });
        accounts = harness.app.get(FinancialAccountService, { strict: false });
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function seedAccount(owner: Account, kind: 'provider' | 'file', name: string): Promise<string> {
        const created = await harness.inCompany(owner.company.id, async () =>
            kind === 'provider'
                ? accounts.upsertProviderAccount({ provider: 'pluggy', externalId: `ext-${name}`, kind: 'checking', name, currency: 'BRL' })
                : accounts.createFileAccount({ kind: 'checking', name, currency: 'BRL' })
        );
        return created.id;
    }

    async function seed(
        owner: Account,
        accountId: string,
        source: 'pluggy' | 'ofx' | 'sample',
        items: IncomingTransaction[]
    ): Promise<void> {
        await harness.inCompany(owner.company.id, async () => ingestion.ingest({ accountId, source, items }));
    }

    async function category(owner: Account, systemKey: string): Promise<CategoryBody> {
        const body = (await harness.call<{ categories: CategoryBody[] }>(owner.token, 'GET', '/spending/categories')).body;
        return body.categories.find((candidate: CategoryBody) => candidate.systemKey === systemKey) as CategoryBody;
    }

    async function list(owner: Account, query: string): Promise<{ status: number; body: ListBody }> {
        return harness.call<ListBody>(owner.token, 'GET', `/spending/transactions?${query}`);
    }

    async function transactionId(owner: Account, externalId: string): Promise<string> {
        const result = await harness.pg.query<{ id: string }>(
            'SELECT "id" FROM "Transactions" WHERE "companyId" = $1 AND "externalId" = $2',
            [owner.company.id, externalId]
        );
        return result.rows[0]?.id as string;
    }

    it('exige sessão em todas as rotas', async () => {
        const id: string = crypto.randomUUID();

        const statuses: number[] = await Promise.all([
            harness.call(null, 'GET', '/spending/transactions').then((response) => response.status),
            harness.call(null, 'GET', '/spending/transactions/uncategorized-count').then((response) => response.status),
            harness.call(null, 'PATCH', `/spending/transactions/${id}`, {}).then((response) => response.status),
            harness.call(null, 'GET', '/spending/accounts').then((response) => response.status),
            harness.call(null, 'PATCH', `/spending/accounts/${id}`, {}).then((response) => response.status),
            harness.call(null, 'DELETE', `/spending/accounts/${id}`).then((response) => response.status)
        ]);

        expect(statuses).toEqual([401, 401, 401, 401, 401, 401]);
    });

    it('PATCH com regra de favorecido recategoriza o passado na mesma transação e a regra aparece em /spending/rules', async () => {
        const owner: Account = await harness.signUp('pix');
        const accountId: string = await seedAccount(owner, 'provider', 'Itaú');
        const pix = (id: string, date: string, amountMinor: number): IncomingTransaction =>
            item(id, date, amountMinor, 'Pix enviado · Maria Souza', {
                counterpartyName: 'Maria Souza',
                counterpartyDocument: MARIA_DOCUMENT,
                providerCategoryId: '05000000'
            });
        await seed(owner, accountId, 'pluggy', [pix('pluggy:pix1', '2026-09-14', -35000), pix('pluggy:pix2', '2026-09-28', -45000)]);
        const housing: CategoryBody = await category(owner, 'housing');
        const target: string = await transactionId(owner, 'pluggy:pix2');

        const saved = await harness.call<SavedBody>(owner.token, 'PATCH', `/spending/transactions/${target}`, {
            categoryId: housing.id,
            rule: { scope: 'counterparty' }
        });

        expect(saved.status).toBe(200);
        expect(saved.body.transaction).toMatchObject({ categoryId: housing.id, categorySource: 'user', ruleId: null });
        expect(saved.body.recategorized).toBe(1);
        expect(saved.body.rule).toMatchObject({
            matchType: 'counterparty',
            label: 'Maria Souza',
            appliesTo: 'out',
            categoryId: housing.id
        });
        const other = await harness.pg.query<{ categoryId: string; categorySource: string; ruleId: string }>(
            `SELECT "categoryId", "categorySource", "ruleId" FROM "Transactions" WHERE "companyId" = $1 AND "externalId" = 'pluggy:pix1'`,
            [owner.company.id]
        );
        expect(other.rows[0]).toEqual({ categoryId: housing.id, categorySource: 'rule', ruleId: saved.body.rule?.id });
        const rules = await harness.call<{ rules: { id: string }[] }>(owner.token, 'GET', '/spending/rules');
        expect(rules.body.rules.map((rule) => rule.id)).toContain(saved.body.rule?.id);
        const counted = await harness.call<{ count: number }>(owner.token, 'GET', '/spending/transactions/uncategorized-count');
        expect(counted.body.count).toBe(0);
    });

    it('remover a regra devolve as linhas ao pipeline e remover a categoria move para o destino', async () => {
        const owner: Account = await harness.signUp('driver');
        const accountId: string = await seedAccount(owner, 'provider', 'Conta');
        await seed(owner, accountId, 'pluggy', [
            item('pluggy:r1', '2026-09-10', -1500, 'LOJINHA DO BAIRRO'),
            item('pluggy:r2', '2026-09-11', -2500, 'LOJINHA DO BAIRRO')
        ]);
        const housing: CategoryBody = await category(owner, 'housing');
        const created = await harness.call<{ rule: { id: string }; recategorized: number }>(owner.token, 'POST', '/spending/rules', {
            matchType: 'contains',
            pattern: 'lojinha',
            appliesTo: 'out',
            categoryId: housing.id
        });
        expect(created.body.recategorized).toBe(2);

        const removed = await harness.call<{ recategorized: number }>(owner.token, 'DELETE', `/spending/rules/${created.body.rule.id}`);

        expect(removed.body.recategorized).toBe(2);
        const after = await harness.pg.query<{ categoryId: string | null; categorySource: string }>(
            'SELECT "categoryId", "categorySource" FROM "Transactions" WHERE "companyId" = $1',
            [owner.company.id]
        );
        expect(after.rows).toEqual([
            { categoryId: null, categorySource: 'none' },
            { categoryId: null, categorySource: 'none' }
        ]);
        const custom = await harness.call<CategoryBody>(owner.token, 'POST', '/spending/categories', {
            name: 'Doações',
            kind: 'expense',
            flexibility: 'flexible',
            icon: 'Gift'
        });
        const target: string = await transactionId(owner, 'pluggy:r1');
        await harness.call(owner.token, 'PATCH', `/spending/transactions/${target}`, { categoryId: custom.body.id });
        const leisure: CategoryBody = await category(owner, 'leisure');
        const moved = await harness.call<{ recategorized: number }>(
            owner.token,
            'DELETE',
            `/spending/categories/${custom.body.id}?moveTo=${leisure.id}`
        );
        expect(moved.body.recategorized).toBe(1);
        const movedRow = await harness.pg.query<{ categoryId: string; categorySource: string }>(
            'SELECT "categoryId", "categorySource" FROM "Transactions" WHERE "id" = $1',
            [target]
        );
        expect(movedRow.rows[0]).toEqual({ categoryId: leisure.id, categorySource: 'user' });
    });

    it('recusa categoria de renda em saída, aceita gasto em entrada e valida a regra', async () => {
        const owner: Account = await harness.signUp('kinds');
        const accountId: string = await seedAccount(owner, 'provider', 'Conta');
        await seed(owner, accountId, 'pluggy', [
            item('pluggy:out', '2026-09-10', -1500, 'LOJA X'),
            item('pluggy:in', '2026-09-11', 2500, 'ESTORNO LOJA X')
        ]);
        const income: CategoryBody = await category(owner, 'income');
        const shopping: CategoryBody = await category(owner, 'shopping');
        const outId: string = await transactionId(owner, 'pluggy:out');
        const inId: string = await transactionId(owner, 'pluggy:in');

        const mismatch = await harness.call<ProblemBody>(owner.token, 'PATCH', `/spending/transactions/${outId}`, {
            categoryId: income.id
        });
        const refund = await harness.call<SavedBody>(owner.token, 'PATCH', `/spending/transactions/${inId}`, { categoryId: shopping.id });
        const noCounterparty = await harness.call<ProblemBody>(owner.token, 'PATCH', `/spending/transactions/${outId}`, {
            categoryId: shopping.id,
            rule: { scope: 'counterparty' }
        });
        const missingCategory = await harness.call<ProblemBody>(owner.token, 'PATCH', `/spending/transactions/${outId}`, {
            categoryId: crypto.randomUUID()
        });
        const missingTransaction = await harness.call<ProblemBody>(owner.token, 'PATCH', `/spending/transactions/${crypto.randomUUID()}`, {
            categoryId: shopping.id
        });
        const ruleWithoutCategory = await harness.call(owner.token, 'PATCH', `/spending/transactions/${outId}`, {
            categoryId: null,
            rule: { scope: 'description' }
        });

        expect(mismatch).toMatchObject({ status: 422, body: { type: 'transactions.category_kind_mismatch' } });
        expect(refund.status).toBe(200);
        expect(refund.body.transaction.categorySource).toBe('user');
        expect(noCounterparty).toMatchObject({ status: 422, body: { type: 'categories.invalid_rule' } });
        expect(missingCategory).toMatchObject({ status: 404, body: { type: 'categories.category_not_found' } });
        expect(missingTransaction).toMatchObject({ status: 404, body: { type: 'transactions.transaction_not_found' } });
        expect(ruleWithoutCategory.status).toBe(400);
    });

    it('categoryId nulo volta ao automático', async () => {
        const owner: Account = await harness.signUp('automatic');
        const accountId: string = await seedAccount(owner, 'provider', 'Conta');
        await seed(owner, accountId, 'pluggy', [item('pluggy:n1', '2026-09-10', -5590, 'NETFLIX.COM')]);
        const leisure: CategoryBody = await category(owner, 'leisure');
        const id: string = await transactionId(owner, 'pluggy:n1');
        await harness.call(owner.token, 'PATCH', `/spending/transactions/${id}`, { categoryId: leisure.id });

        const back = await harness.call<SavedBody>(owner.token, 'PATCH', `/spending/transactions/${id}`, { categoryId: null });

        const subscriptions: CategoryBody = await category(owner, 'subscriptions');
        expect(back.body.transaction).toMatchObject({ categoryId: subscriptions.id, categorySource: 'dictionary' });
        expect(back.body.rule).toBeNull();
        expect(back.body.recategorized).toBe(0);
    });

    it('lista com filtros por mês, conta, categoria, sem categoria, busca normalizada e sentido, e os totais seguem o filtro', async () => {
        const owner: Account = await harness.signUp('list');
        const itau: string = await seedAccount(owner, 'provider', 'Itaú');
        const nubank: string = await seedAccount(owner, 'file', 'Nubank');
        await seed(owner, itau, 'pluggy', [
            item('pluggy:l1', '2026-09-05', 2800000, 'SALARIO EMPRESA X'),
            item('pluggy:l2', '2026-09-20', -100000, 'SUPERMERCADO BOM PRECO', { providerCategoryId: '10000000' }),
            item('pluggy:l3', '2026-09-21', -35000, 'Pix enviado · José da Silva', { counterpartyName: 'José da Silva' }),
            item('pluggy:l4', '2026-08-30', -999, 'PADARIA ESTRELA')
        ]);
        await seed(owner, nubank, 'ofx', [item('ofx:l5', '2026-09-22', -5590, 'NETFLIX.COM')]);
        const groceries: CategoryBody = await category(owner, 'groceries');

        const september = await list(owner, 'month=2026-09');
        const byAccount = await list(owner, `month=2026-09&accountId=${nubank}`);
        const byCategory = await list(owner, `month=2026-09&categoryId=${groceries.id}`);
        const uncategorized = await list(owner, 'month=2026-09&uncategorized=true');
        const outgoing = await list(owner, 'month=2026-09&direction=out');
        const incoming = await list(owner, 'month=2026-09&direction=in');
        const search = await list(owner, 'month=2026-09&q=supermercado');
        const searchName = await list(owner, 'from=2026-08-01&to=2026-09-30&q=Jos');
        const paged = await list(owner, 'month=2026-09&pageSize=2&page=2');

        expect(september.body.data.map((row: TransactionBody) => row.description)).toEqual([
            'NETFLIX.COM',
            'Pix enviado · José da Silva',
            'SUPERMERCADO BOM PRECO',
            'SALARIO EMPRESA X'
        ]);
        expect(september.body.totals).toEqual({ inMinor: 2800000, outMinor: -140590, count: 4 });
        expect(september.body.data[0]).toMatchObject({ accountName: 'Nubank', source: 'ofx', categorySource: 'dictionary' });
        expect(byAccount.body.data).toHaveLength(1);
        expect(byAccount.body.totals).toEqual({ inMinor: 0, outMinor: -5590, count: 1 });
        expect(byCategory.body.data.map((row: TransactionBody) => row.description)).toEqual(['SUPERMERCADO BOM PRECO']);
        expect(uncategorized.body.data.map((row: TransactionBody) => row.description)).toEqual(['Pix enviado · José da Silva']);
        expect(outgoing.body.totals.count).toBe(3);
        expect(incoming.body.totals).toEqual({ inMinor: 2800000, outMinor: 0, count: 1 });
        expect(search.body.data).toHaveLength(1);
        expect(searchName.body.data).toHaveLength(1);
        expect(paged.body.data).toHaveLength(2);
        expect(paged.body.pagination).toEqual({ page: 2, pageSize: 2, totalRecords: 4, totalPages: 2 });
        expect(paged.body.totals.count).toBe(4);
    });

    it('rejeita parâmetros inválidos com 400', async () => {
        const owner: Account = await harness.signUp('invalid');
        const categoryId: string = crypto.randomUUID();

        const statuses: number[] = await Promise.all(
            [
                'pageSize=201',
                'pageSize=0',
                'page=0',
                'month=2026-13',
                'month=2026-09&from=2026-09-01&to=2026-09-30',
                'from=2026-09-01',
                'from=2025-01-01&to=2026-12-31',
                'from=2026-09-30&to=2026-09-01',
                `categoryId=${categoryId}&uncategorized=true`,
                'q=a',
                'direction=sideways'
            ].map(async (query: string) => (await list(owner, query)).status)
        );

        expect(statuses).toEqual(new Array<number>(11).fill(400));
    });

    it('sem parâmetros lista o mês corrente da company', async () => {
        const owner: Account = await harness.signUp('current');
        const accountId: string = await seedAccount(owner, 'provider', 'Conta');
        const today: string = new Date().toISOString().slice(0, 10);
        await seed(owner, accountId, 'pluggy', [
            item('pluggy:now', today, -100, 'COMPRA DE HOJE'),
            item('pluggy:old', '2020-01-10', -100, 'COMPRA ANTIGA')
        ]);

        const response = await harness.call<ListBody>(owner.token, 'GET', '/spending/transactions');

        expect(response.body.data.map((row: TransactionBody) => row.description)).toEqual(['COMPRA DE HOJE']);
    });

    it('conta as saídas sem categoria de todos os tempos e ignora os dados de exemplo', async () => {
        const owner: Account = await harness.signUp('count');
        const accountId: string = await seedAccount(owner, 'provider', 'Conta');
        await seed(owner, accountId, 'pluggy', [
            item('pluggy:c1', '2020-01-10', -100, 'COISA ESTRANHA'),
            item('pluggy:c2', '2026-09-10', -100, 'OUTRA COISA ESTRANHA'),
            item('pluggy:c3', '2026-09-10', 100, 'ENTRADA ESTRANHA')
        ]);
        await seed(owner, accountId, 'sample', [item('sample:c4', '2026-09-10', -100, 'EXEMPLO ESTRANHO')]);

        const counted = await harness.call<{ count: number }>(owner.token, 'GET', '/spending/transactions/uncategorized-count');

        expect(counted.body.count).toBe(2);
    });

    it('contas: lista com contagem, renomeia, exclui conta de arquivo e protege a conta da Pluggy', async () => {
        const owner: Account = await harness.signUp('accounts');
        const provider: string = await seedAccount(owner, 'provider', 'Itaú');
        const file: string = await seedAccount(owner, 'file', 'Extrato');
        await seed(owner, provider, 'pluggy', [
            item('pluggy:a1', '2026-09-10', -100, 'COMPRA A'),
            item('pluggy:a2', '2026-09-12', -100, 'COMPRA B')
        ]);
        await seed(owner, file, 'ofx', [item('ofx:a3', '2026-09-11', -300, 'COMPRA C')]);

        const listed = await harness.call<{ accounts: AccountBody[] }>(owner.token, 'GET', '/spending/accounts');
        const renamed = await harness.call<AccountBody>(owner.token, 'PATCH', `/spending/accounts/${provider}`, {
            name: '  Itaú Principal  '
        });
        const managed = await harness.call<ProblemBody>(owner.token, 'DELETE', `/spending/accounts/${provider}`);
        const removed = await harness.call(owner.token, 'DELETE', `/spending/accounts/${file}`);
        const again = await harness.call<ProblemBody>(owner.token, 'DELETE', `/spending/accounts/${file}`);

        expect(listed.body.accounts).toMatchObject([
            { id: provider, name: 'Itaú', source: 'pluggy', transactionCount: 2, lastTransactionDate: '2026-09-12' },
            { id: file, name: 'Extrato', source: 'file', transactionCount: 1, lastTransactionDate: '2026-09-11' }
        ]);
        expect(renamed.body).toMatchObject({ name: 'Itaú Principal', transactionCount: 2 });
        expect(managed).toMatchObject({ status: 422, body: { type: 'transactions.account_managed_by_connection' } });
        expect(removed.status).toBe(204);
        expect(again).toMatchObject({ status: 404, body: { type: 'transactions.account_not_found' } });
        const remaining = await list(owner, 'month=2026-09');
        expect(remaining.body.totals.count).toBe(2);
    });

    it('isolamento: a company B não lista, não edita nem lê a contagem da A', async () => {
        const first: Account = await harness.signUp('tenant-a');
        const second: Account = await harness.signUp('tenant-b');
        const accountId: string = await seedAccount(first, 'provider', 'Conta A');
        await seed(first, accountId, 'pluggy', [item('pluggy:iso', '2026-09-10', -100, 'SEGREDO DA A')]);
        const id: string = await transactionId(first, 'pluggy:iso');
        const shopping: CategoryBody = await category(second, 'shopping');

        const listed = await list(second, 'month=2026-09');
        const patched = await harness.call<ProblemBody>(second.token, 'PATCH', `/spending/transactions/${id}`, { categoryId: shopping.id });
        const counted = await harness.call<{ count: number }>(second.token, 'GET', '/spending/transactions/uncategorized-count');
        const accountsOfB = await harness.call<{ accounts: AccountBody[] }>(second.token, 'GET', '/spending/accounts');
        const renamed = await harness.call<ProblemBody>(second.token, 'PATCH', `/spending/accounts/${accountId}`, { name: 'Invadida' });

        expect(listed.body.data).toEqual([]);
        expect(listed.body.totals).toEqual({ inMinor: 0, outMinor: 0, count: 0 });
        expect(patched).toMatchObject({ status: 404, body: { type: 'transactions.transaction_not_found' } });
        expect(counted.body.count).toBe(0);
        expect(accountsOfB.body.accounts).toEqual([]);
        expect(renamed.status).toBe(404);
    });
});
