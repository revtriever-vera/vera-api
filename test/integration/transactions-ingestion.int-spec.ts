import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '../../src/shared/errors/app.error';
import { FinancialAccountService } from '../../src/modules/transactions/services/financial-account.service';
import { SpendingDatasetService } from '../../src/modules/transactions/services/spending-dataset.service';
import { TransactionAggregatesService } from '../../src/modules/transactions/services/transaction-aggregates.service';
import { TransactionImportService } from '../../src/modules/transactions/services/transaction-import.service';
import { TransactionIngestionService } from '../../src/modules/transactions/services/transaction-ingestion.service';
import { TransactionRecategorizeApplication } from '../../src/modules/transactions/application/transaction-recategorize.application';
import { CategoryReaderService } from '../../src/modules/spending-categories/services/category-reader.service';
import { IncomingTransaction, IngestionResult } from '../../src/modules/transactions/domain/transactions.types';
import { Account, AllocationHarness } from './support/allocation-harness';

interface RowShape {
    readonly externalId: string;
    readonly systemKey: string | null;
    readonly categorySource: string;
}

function item(externalId: string, date: string, amountMinor: number, description: string): IncomingTransaction {
    return { externalId, date, amountMinor, currency: 'BRL', description };
}

describe('transactions ingestion', () => {
    let harness: AllocationHarness;
    let ingestion: TransactionIngestionService;
    let accounts: FinancialAccountService;
    let imports: TransactionImportService;
    let aggregates: TransactionAggregatesService;

    beforeAll(async () => {
        harness = await AllocationHarness.start('transactions_ingestion');
        ingestion = harness.app.get(TransactionIngestionService, { strict: false });
        accounts = harness.app.get(FinancialAccountService, { strict: false });
        imports = harness.app.get(TransactionImportService, { strict: false });
        aggregates = harness.app.get(TransactionAggregatesService, { strict: false });
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function providerAccount(owner: Account, externalId: string, name: string = 'Cartão'): Promise<string> {
        const created = await harness.inCompany(owner.company.id, async () =>
            accounts.upsertProviderAccount({
                provider: 'pluggy',
                externalId,
                kind: 'credit_card',
                name,
                institutionName: 'Banco Exemplo',
                numberLast4: '1234',
                currency: 'BRL'
            })
        );
        return created.id;
    }

    async function ingest(
        owner: Account,
        accountId: string,
        source: 'pluggy' | 'ofx' | 'csv' | 'sample',
        items: IncomingTransaction[],
        importId: string | null = null
    ): Promise<IngestionResult> {
        return harness.inCompany(owner.company.id, async () => ingestion.ingest({ accountId, source, importId, items }));
    }

    async function rows(owner: Account, accountId: string): Promise<RowShape[]> {
        const result = await harness.pg.query<RowShape>(
            `SELECT t."externalId", c."systemKey", t."categorySource"
               FROM "Transactions" t LEFT JOIN "SpendingCategories" c ON c."id" = t."categoryId"
              WHERE t."companyId" = $1 AND t."accountId" = $2 AND t."deletedAt" IS NULL ORDER BY t."externalId"`,
            [owner.company.id, accountId]
        );
        return result.rows;
    }

    it('ingere o conjunto canônico e as categorias saem como nas tabelas do card', async () => {
        const owner: Account = await harness.signUp('dataset');
        const dataset = new SpendingDatasetService().build('2026-10-11');
        const ids: Map<string, string> = new Map<string, string>();
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
            ids.set(spec.key, created.id);
        }
        for (const spec of dataset.accounts) {
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
            const result: IngestionResult = await ingest(owner, ids.get(spec.key) as string, 'pluggy', items);
            expect(result).toMatchObject({ inserted: items.length, rejected: 0, duplicates: 0 });
        }

        const stored = await harness.pg.query<RowShape>(
            `SELECT t."externalId", c."systemKey", t."categorySource" FROM "Transactions" t
               LEFT JOIN "SpendingCategories" c ON c."id" = t."categoryId" WHERE t."companyId" = $1`,
            [owner.company.id]
        );
        const byKey: Map<string, string | null> = new Map(stored.rows.map((row) => [row.externalId, row.systemKey]));
        const wrong = dataset.transactions.filter((transaction) => byKey.get(`pluggy:${transaction.key}`) !== transaction.expectedCategory);
        expect(wrong.map((transaction) => transaction.key)).toEqual([]);
        expect(stored.rows).toHaveLength(dataset.transactions.length);

        const leaked = await harness.pg.query('SELECT 1 FROM "Transactions" t WHERE t."companyId" = $1 AND t::text LIKE $2', [
            owner.company.id,
            '%00000000191%'
        ]);
        expect(leaked.rowCount).toBe(0);
        const keyed = await harness.pg.query<{ total: string }>(
            `SELECT count(DISTINCT "counterpartyKey") AS total FROM "Transactions" WHERE "companyId" = $1 AND "counterpartyKey" IS NOT NULL`,
            [owner.company.id]
        );
        expect(keyed.rows[0]?.total).toBe('1');
    });

    it('os totais mensais por categoria do mês fechado reproduzem o protótipo', async () => {
        const owner: Account = await harness.signUp('totals');
        const dataset = new SpendingDatasetService().build('2026-10-11');
        const ids: Map<string, string> = new Map<string, string>();
        for (const spec of dataset.accounts) {
            ids.set(spec.key, await providerAccount(owner, `acc-${spec.key}`, spec.name));
        }
        for (const spec of dataset.accounts) {
            await ingest(
                owner,
                ids.get(spec.key) as string,
                'sample',
                dataset.transactions
                    .filter((transaction) => transaction.accountKey === spec.key)
                    .map((transaction) => ({
                        externalId: `sample:${transaction.key}`,
                        date: transaction.date,
                        amountMinor: transaction.amountMinor,
                        currency: 'BRL',
                        description: transaction.description,
                        counterpartyName: transaction.counterpartyName,
                        counterpartyDocument: transaction.counterpartyDocument,
                        providerCategoryId: transaction.providerCategoryId
                    }))
            );
        }

        const nets = await harness.inCompany(owner.company.id, async () =>
            aggregates.monthlyNetByCategory({ fromMonth: '2026-09', toMonth: '2026-09' })
        );
        const categories = await harness.pg.query<{ id: string; systemKey: string }>(
            'SELECT "id", "systemKey" FROM "SpendingCategories" WHERE "companyId" = $1',
            [owner.company.id]
        );
        const keyById: Map<string, string> = new Map(categories.rows.map((row) => [row.id, row.systemKey]));
        const totals: Record<string, number> = {};
        for (const net of nets) {
            totals[net.categoryId === null ? 'none' : (keyById.get(net.categoryId) as string)] = net.netMinor;
        }
        expect(totals).toEqual({
            income: 2_800_000,
            housing: -770_000,
            education: -320_000,
            health: -140_000,
            groceries: -290_000,
            eating_out: -245_000,
            transport: -130_000,
            leisure: -190_000,
            subscriptions: -64_000,
            shopping: -235_000,
            card_payment: 0,
            investments: -200_000,
            own_transfer: 0,
            none: -80_000
        });
        const months = await harness.inCompany(owner.company.id, async () =>
            aggregates.monthsWithData({ fromMonth: '2026-05', toMonth: '2026-10' })
        );
        expect(months).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
        const other = await harness.inCompany(owner.company.id, async () => aggregates.excludedCurrencyCount('2026-09'));
        expect(other).toBe(0);
    });

    it('ingerir duas vezes o mesmo lote não duplica e devolve unchanged', async () => {
        const owner: Account = await harness.signUp('idempotent');
        const accountId: string = await providerAccount(owner, 'acc-1');
        const items: IncomingTransaction[] = [
            item('pluggy:a', '2026-09-01', -1000, 'UBER *TRIP'),
            item('pluggy:b', '2026-09-02', -2000, 'NETFLIX.COM'),
            item('pluggy:c', '2026-09-03', 500000, 'SALARIO')
        ];

        const first: IngestionResult = await ingest(owner, accountId, 'pluggy', items);
        const second: IngestionResult = await ingest(owner, accountId, 'pluggy', items);

        expect(first).toEqual({ inserted: 3, updated: 0, unchanged: 0, duplicates: 0, superseded: 0, rejected: 0 });
        expect(second).toEqual({ inserted: 0, updated: 0, unchanged: 3, duplicates: 0, superseded: 0, rejected: 0 });
        expect(await rows(owner, accountId)).toHaveLength(3);
    });

    it('mudança de descrição recategoriza se não for do usuário e preserva a escolha do usuário', async () => {
        const owner: Account = await harness.signUp('changes');
        const accountId: string = await providerAccount(owner, 'acc-2');
        await ingest(owner, accountId, 'pluggy', [
            item('pluggy:x', '2026-09-01', -1000, 'COMPRA QUALQUER'),
            item('pluggy:y', '2026-09-01', -2000, 'OUTRA COMPRA')
        ]);
        const reader = harness.app.get(CategoryReaderService, { strict: false });
        const recategorize = harness.app.get(TransactionRecategorizeApplication, { strict: false });
        const categories = await harness.inCompany(owner.company.id, async () => reader.listForCompany());
        const leisure: string = categories.find((category) => category.systemKey === 'leisure')?.id as string;
        const id = await harness.pg.query<{ id: string }>('SELECT "id" FROM "Transactions" WHERE "companyId" = $1 AND "externalId" = $2', [
            owner.company.id,
            'pluggy:y'
        ]);
        await harness.inCompany(owner.company.id, async () => recategorize.recategorize(id.rows[0]?.id as string, { categoryId: leisure }));

        const result: IngestionResult = await ingest(owner, accountId, 'pluggy', [
            item('pluggy:x', '2026-09-01', -1000, 'NETFLIX.COM'),
            item('pluggy:y', '2026-09-01', -2000, 'NETFLIX.COM')
        ]);

        expect(result).toMatchObject({ updated: 2, inserted: 0 });
        const stored = await rows(owner, accountId);
        expect(stored.find((row) => row.externalId === 'pluggy:x')).toMatchObject({
            systemKey: 'subscriptions',
            categorySource: 'dictionary'
        });
        expect(stored.find((row) => row.externalId === 'pluggy:y')).toMatchObject({ systemKey: 'leisure', categorySource: 'user' });
    });

    it('arquivo depois da Pluggy: duas linhas casam e uma entra; reimportar dá 3 duplicadas', async () => {
        const owner: Account = await harness.signUp('file-after');
        const accountId: string = await providerAccount(owner, 'acc-3');
        await ingest(owner, accountId, 'pluggy', [
            item('pluggy:p1', '2026-09-10', -5000, 'COMPRA A'),
            item('pluggy:p2', '2026-09-12', -7000, 'COMPRA B')
        ]);
        const file: IncomingTransaction[] = [
            item('ofx:o1', '2026-09-11', -5000, 'COMPRA A'),
            item('ofx:o2', '2026-09-12', -7000, 'COMPRA B'),
            item('ofx:o3', '2026-09-20', -999, 'COMPRA C')
        ];

        const first: IngestionResult = await ingest(owner, accountId, 'ofx', file);
        const second: IngestionResult = await ingest(owner, accountId, 'ofx', file);

        expect(first).toMatchObject({ inserted: 1, duplicates: 2, superseded: 0 });
        expect(second).toMatchObject({ inserted: 0, duplicates: 3 });
        const absorbed = await harness.pg.query<{ absorbedExternalId: string }>(
            'SELECT "absorbedExternalId" FROM "Transactions" WHERE "companyId" = $1 AND "absorbedExternalId" IS NOT NULL ORDER BY 1',
            [owner.company.id]
        );
        expect(absorbed.rows.map((row) => row.absorbedExternalId)).toEqual(['ofx:o1', 'ofx:o2']);
        expect(await rows(owner, accountId)).toHaveLength(3);
    });

    it('duas compras iguais no mesmo dia casam uma a uma e a sobra entra como nova', async () => {
        const owner: Account = await harness.signUp('twins');
        const accountId: string = await providerAccount(owner, 'acc-4');
        await ingest(owner, accountId, 'pluggy', [item('pluggy:t1', '2026-09-10', -5000, 'CAFE')]);

        const result: IngestionResult = await ingest(owner, accountId, 'csv', [
            item('csv:t1', '2026-09-10', -5000, 'CAFE'),
            item('csv:t2', '2026-09-10', -5000, 'CAFE')
        ]);

        expect(result).toMatchObject({ inserted: 1, duplicates: 1 });
    });

    it('Pluggy depois do arquivo: o arquivo vira superseded e a linha da Pluggy herda a categoria do usuário', async () => {
        const owner: Account = await harness.signUp('pluggy-after');
        const accountId: string = await providerAccount(owner, 'acc-5');
        await ingest(owner, accountId, 'ofx', [item('ofx:f1', '2026-09-05', -3000, 'PAGTO MISTERIOSO')]);
        const reader = harness.app.get(CategoryReaderService, { strict: false });
        const recategorize = harness.app.get(TransactionRecategorizeApplication, { strict: false });
        const categories = await harness.inCompany(owner.company.id, async () => reader.listForCompany());
        const groceries: string = categories.find((category) => category.systemKey === 'groceries')?.id as string;
        const fileRow = await harness.pg.query<{ id: string }>('SELECT "id" FROM "Transactions" WHERE "companyId" = $1', [
            owner.company.id
        ]);
        await harness.inCompany(owner.company.id, async () =>
            recategorize.recategorize(fileRow.rows[0]?.id as string, { categoryId: groceries })
        );

        const result: IngestionResult = await ingest(owner, accountId, 'pluggy', [
            item('pluggy:g1', '2026-09-06', -3000, 'PAGTO MISTERIOSO')
        ]);

        expect(result).toMatchObject({ inserted: 0, superseded: 1 });
        expect(await rows(owner, accountId)).toEqual([{ externalId: 'pluggy:g1', systemKey: 'groceries', categorySource: 'user' }]);
        const superseded = await harness.pg.query<{ supersededById: string | null; deletedAt: Date | null }>(
            `SELECT "supersededById", "deletedAt" FROM "Transactions" WHERE "companyId" = $1 AND "externalId" = 'ofx:f1'`,
            [owner.company.id]
        );
        expect(superseded.rows[0]?.deletedAt).not.toBeNull();
        expect(superseded.rows[0]?.supersededById).not.toBeNull();
        const reimport: IngestionResult = await ingest(owner, accountId, 'ofx', [item('ofx:f1', '2026-09-05', -3000, 'PAGTO MISTERIOSO')]);
        expect(reimport).toMatchObject({ inserted: 0, duplicates: 1 });
    });

    it('desfazer um lote remove as linhas e devolve à linha da Pluggy a chance de casar de novo', async () => {
        const owner: Account = await harness.signUp('undo');
        const accountId: string = await providerAccount(owner, 'acc-6');
        await ingest(owner, accountId, 'pluggy', [item('pluggy:u1', '2026-09-10', -5000, 'COMPRA A')]);
        const file: IncomingTransaction[] = [
            item('ofx:u1', '2026-09-10', -5000, 'COMPRA A'),
            item('ofx:u2', '2026-09-15', -1500, 'COMPRA D')
        ];
        const record = await harness.inCompany(owner.company.id, async () =>
            imports.record({ accountId, format: 'ofx', fileName: 'extrato.ofx', fileSha256: 'a'.repeat(64), rows: 2 })
        );
        const result: IngestionResult = await ingest(owner, accountId, 'ofx', file, record.id);
        await harness.inCompany(owner.company.id, async () =>
            imports.finish(record.id, { inserted: result.inserted, duplicates: result.duplicates, rejected: result.rejected })
        );
        expect(await harness.inCompany(owner.company.id, async () => imports.countCompleted())).toBe(1);

        const undone = await harness.inCompany(owner.company.id, async () => imports.undo(record.id));

        expect(undone.removed).toBe(1);
        expect(await rows(owner, accountId)).toEqual([{ externalId: 'pluggy:u1', systemKey: null, categorySource: 'none' }]);
        expect(await harness.inCompany(owner.company.id, async () => imports.countCompleted())).toBe(0);
        const again: IngestionResult = await ingest(owner, accountId, 'ofx', file);
        expect(again).toMatchObject({ inserted: 1, duplicates: 1 });
    });

    it('rejeita valor zero, data inválida e descrição vazia, e deduplica ids repetidos no lote', async () => {
        const owner: Account = await harness.signUp('rejected');
        const accountId: string = await providerAccount(owner, 'acc-7');

        const result: IngestionResult = await ingest(owner, accountId, 'pluggy', [
            item('pluggy:z', '2026-09-01', 0, 'ZERO'),
            item('pluggy:d', '2026-02-31', -100, 'DATA RUIM'),
            item('pluggy:e', '2026-09-01', -100, '   '),
            item('pluggy:k', '2026-09-01', -100, 'OK'),
            item('pluggy:k', '2026-09-01', -100, 'OK')
        ]);

        expect(result).toEqual({ inserted: 1, updated: 0, unchanged: 0, duplicates: 1, superseded: 0, rejected: 3 });
    });

    it('duas ingestões simultâneas do mesmo lote resultam em uma linha por externalId', async () => {
        const owner: Account = await harness.signUp('concurrent');
        const accountId: string = await providerAccount(owner, 'acc-8');
        const items: IncomingTransaction[] = Array.from({ length: 60 }, (_, index: number) =>
            item(`pluggy:c${String(index)}`, '2026-09-01', -(index + 1) * 100, `COMPRA ${String(index)}`)
        );

        const [left, right] = await Promise.all([ingest(owner, accountId, 'pluggy', items), ingest(owner, accountId, 'pluggy', items)]);

        expect(left.inserted + right.inserted).toBe(60);
        expect(left.unchanged + right.unchanged).toBe(60);
        expect(await rows(owner, accountId)).toHaveLength(60);
    });

    it('atualizar a conta da Pluggy pelo id externo mantém a mesma conta e o nome escolhido pelo usuário', async () => {
        const owner: Account = await harness.signUp('upsert');
        const first: string = await providerAccount(owner, 'acc-up', 'Nome do banco');
        await harness.call(owner.token, 'PATCH', `/spending/accounts/${first}`, { name: 'Meu nome' });

        const second = await harness.inCompany(owner.company.id, async () =>
            accounts.upsertProviderAccount({
                provider: 'pluggy',
                externalId: 'acc-up',
                kind: 'savings',
                name: 'Outro nome do banco',
                numberLast4: '9999',
                currency: 'BRL'
            })
        );

        expect(second.id).toBe(first);
        expect(second).toMatchObject({ name: 'Meu nome', kind: 'savings', numberLast4: '9999' });
    });

    it('excluir a company remove contas, lotes e transações em cascata', async () => {
        const owner: Account = await harness.signUp('cascade');
        const accountId: string = await providerAccount(owner, 'acc-10');
        const record = await harness.inCompany(owner.company.id, async () =>
            imports.record({ accountId, format: 'ofx', fileName: 'x.ofx', fileSha256: 'c'.repeat(64), rows: 1 })
        );
        await ingest(owner, accountId, 'ofx', [item('ofx:cascade', '2026-09-01', -100, 'COMPRA')], record.id);

        await harness.pg.query('DELETE FROM "Companies" WHERE "id" = $1', [owner.company.id]);

        for (const table of ['FinancialAccounts', 'TransactionImports', 'Transactions']) {
            const left = await harness.pg.query(`SELECT 1 FROM "${table}" WHERE "companyId" = $1`, [owner.company.id]);
            expect(left.rowCount).toBe(0);
        }
    });

    it('a ingestão no contexto de outra company com o accountId da primeira dá account_not_found', async () => {
        const first: Account = await harness.signUp('tenant-a');
        const second: Account = await harness.signUp('tenant-b');
        const accountId: string = await providerAccount(first, 'acc-9');

        const attempt: Promise<IngestionResult> = ingest(second, accountId, 'pluggy', [item('pluggy:a', '2026-09-01', -100, 'COMPRA')]);

        await expect(attempt).rejects.toSatisfy(
            (error: unknown) => error instanceof AppError && error.code === 'transactions.account_not_found'
        );
        const stored = await harness.pg.query('SELECT 1 FROM "Transactions" WHERE "accountId" = $1', [accountId]);
        expect(stored.rowCount).toBe(0);
    });
});
