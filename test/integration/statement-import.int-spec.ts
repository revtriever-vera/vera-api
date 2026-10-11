import { AddressInfo, Server } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildQaStatementFiles } from '../../scripts/qa-statement-fixture-core';
import { FinancialAccountService } from '../../src/modules/transactions/services/financial-account.service';
import { SpendingDatasetService } from '../../src/modules/transactions/services/spending-dataset.service';
import { TransactionIngestionService } from '../../src/modules/transactions/services/transaction-ingestion.service';
import { fixture } from '../support/statement-fixtures';
import { Account, AllocationHarness } from './support/allocation-harness';

interface Reply {
    readonly status: number;
    readonly body: Record<string, unknown>;
}

const TODAY: string = new Date().toISOString().slice(0, 10);
const MAPPING: string = JSON.stringify({
    delimiter: ';',
    hasHeader: true,
    dateColumn: 0,
    descriptionColumn: 1,
    amountColumn: 2,
    dateFormat: 'dd/MM/yyyy',
    decimalSeparator: ',',
    invertSign: false
});

describe('statement import', () => {
    let harness: AllocationHarness;
    let origin: string;

    beforeAll(async () => {
        harness = await AllocationHarness.start('statement_import');
        const address: AddressInfo = (harness.app.getHttpServer() as Server).address() as AddressInfo;
        origin = `http://127.0.0.1:${String(address.port)}`;
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function send(
        token: string | null,
        path: string,
        file: Buffer | null,
        fields: Record<string, string> = {},
        name = 'extrato.ofx'
    ): Promise<Reply> {
        const form: FormData = new FormData();
        for (const [key, value] of Object.entries(fields)) {
            form.append(key, value);
        }
        if (file !== null) {
            form.append('file', new Blob([new Uint8Array(file)]), name);
        }
        const response: Response = await fetch(`${origin}${path}`, {
            method: 'POST',
            body: form,
            headers: token === null ? {} : { authorization: `Bearer ${token}` }
        });
        return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    }

    async function count(owner: Account, table: string): Promise<number> {
        const result = await harness.pg.query<{ total: string }>(
            `SELECT count(*) AS total FROM "${table}" WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
            [owner.company.id]
        );
        return Number(result.rows[0]?.total);
    }

    async function seedCanonical(owner: Account): Promise<string> {
        const dataset = new SpendingDatasetService().build(TODAY);
        const accounts = harness.app.get(FinancialAccountService, { strict: false });
        const ingestion = harness.app.get(TransactionIngestionService, { strict: false });
        let cardId: string = '';
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
            cardId = spec.key === 'nubank-card' ? created.id : cardId;
            const items = dataset.transactions
                .filter((transaction) => transaction.accountKey === spec.key)
                .map((transaction) => ({
                    externalId: `pluggy:${transaction.key}`,
                    date: transaction.date,
                    amountMinor: transaction.amountMinor,
                    currency: 'BRL',
                    description: transaction.description
                }));
            await harness.inCompany(owner.company.id, async () => ingestion.ingest({ accountId: created.id, source: 'pluggy', items }));
        }
        return cardId;
    }

    it('exige sessão', async () => {
        expect((await send(null, '/spending/imports/preview', Buffer.from('x'))).status).toBe(401);
        expect((await send(null, '/spending/imports', Buffer.from('x'))).status).toBe(401);
        expect((await fetch(`${origin}/spending/imports`)).status).toBe(401);
    });

    it('a prévia não grava nada, importa em conta nova, reimportar não cria linha e avisa', async () => {
        const owner: Account = await harness.signUp('basic');
        const file: Buffer = fixture('nubank-cartao-1.02.ofx');
        const before = [
            await count(owner, 'Transactions'),
            await count(owner, 'TransactionImports'),
            await count(owner, 'FinancialAccounts')
        ];

        const preview = await send(owner.token, '/spending/imports/preview', file);

        expect(preview.status).toBe(200);
        expect(preview.body).toMatchObject({ format: 'ofx', rows: 4, rejected: 0, alreadyImportedAt: null, suggestedAccountId: null });
        expect([
            await count(owner, 'Transactions'),
            await count(owner, 'TransactionImports'),
            await count(owner, 'FinancialAccounts')
        ]).toEqual(before);

        const first = await send(owner.token, '/spending/imports', file, {
            format: 'ofx',
            newAccountName: 'Nubank Cartão',
            newAccountKind: 'credit_card'
        });
        expect(first.status).toBe(201);
        expect(first.body).toMatchObject({
            rows: 4,
            inserted: 4,
            duplicates: 0,
            rejected: 0,
            status: 'completed',
            accountName: 'Nubank Cartão'
        });

        const again = await send(owner.token, '/spending/imports', file, { format: 'ofx', accountId: String(first.body['accountId']) });
        expect(again.body).toMatchObject({ inserted: 0, duplicates: 4 });
        expect(await count(owner, 'Transactions')).toBe(4);

        const warned = await send(owner.token, '/spending/imports/preview', file);
        expect(warned.body['alreadyImportedAt']).not.toBeNull();
        expect(warned.body['suggestedAccountId']).toBe(first.body['accountId']);

        const list = await harness.call<{ data: Array<Record<string, unknown>> }>(owner.token, 'GET', '/spending/imports');
        expect(list.body.data).toHaveLength(2);
        expect(list.body.data[0]).toMatchObject({ accountName: 'Nubank Cartão' });
    });

    it('importar na conta da Pluggy não duplica o que ela trouxe, e desfazer preserva as linhas dela', async () => {
        const owner: Account = await harness.signUp('pluggy');
        const cardId: string = await seedCanonical(owner);
        const pluggyRows: number = await count(owner, 'Transactions');
        const files = buildQaStatementFiles(TODAY);

        const result = await send(owner.token, '/spending/imports', files.ofx, { format: 'ofx', accountId: cardId });

        expect(result.status).toBe(201);
        expect(result.body).toMatchObject({ rows: 6, inserted: 4, duplicates: 2 });
        expect(await count(owner, 'Transactions')).toBe(pluggyRows + 4);

        const undone = await harness.call<{ removed: number }>(owner.token, 'DELETE', `/spending/imports/${String(result.body['id'])}`);
        expect(undone.body.removed).toBe(4);
        expect(await count(owner, 'Transactions')).toBe(pluggyRows);
    });

    it('CSV genérico: sem mapping a prévia lista colunas e o envio dá 422; com mapping grava 3 com a entrada positiva', async () => {
        const owner: Account = await harness.signUp('csv');
        const csv: Buffer = buildQaStatementFiles(TODAY).csv;

        const preview = await send(owner.token, '/spending/imports/preview', csv);
        expect(preview.body).toMatchObject({ format: 'csv_generic', columns: ['Data', 'Histórico', 'Valor'] });
        const missing = await send(owner.token, '/spending/imports', csv, {
            format: 'csv_generic',
            newAccountName: 'Geral',
            newAccountKind: 'checking'
        });
        expect(missing.status).toBe(422);
        expect(missing.body['type']).toBe('imports.mapping_required');

        const saved = await send(owner.token, '/spending/imports', csv, {
            format: 'csv_generic',
            mapping: MAPPING,
            newAccountName: 'Geral',
            newAccountKind: 'checking'
        });
        expect(saved.body).toMatchObject({ rows: 3, inserted: 3 });
        const amounts = await harness.pg.query<{ amountMinor: string }>(
            'SELECT "amountMinor" FROM "Transactions" WHERE "companyId" = $1 ORDER BY "amountMinor"',
            [owner.company.id]
        );
        expect(amounts.rows.map((row) => Number(row.amountMinor))).toEqual([-5230, -3500, 15000].sort((a, b) => a - b));
    });

    it('limites: 5 MB + 1, 10.001 linhas e moeda diferente', async () => {
        const owner: Account = await harness.signUp('limits');
        const big: Buffer = Buffer.alloc(5 * 1024 * 1024 + 1, 0x61);
        expect((await send(owner.token, '/spending/imports/preview', big)).status).toBe(413);

        const rows: string = Array.from({ length: 10_001 }, () => '01/09/2026;x;-1,00').join('\n');
        const many: Reply = await send(owner.token, '/spending/imports/preview', Buffer.from(`Data;H;V\n${rows}`), { mapping: MAPPING });
        expect(many.status).toBe(422);
        expect(many.body['type']).toBe('imports.too_many_rows');

        const created = await send(owner.token, '/spending/imports', fixture('nubank-cartao-1.02.ofx'), {
            format: 'ofx',
            newAccountName: 'BRL',
            newAccountKind: 'other'
        });
        const usd: Buffer = Buffer.from(
            fixture('nubank-cartao-1.02.ofx').toString('latin1').replace('<CURDEF>BRL', '<CURDEF>USD'),
            'latin1'
        );
        const mismatch = await send(owner.token, '/spending/imports', usd, { format: 'ofx', accountId: String(created.body['accountId']) });
        expect(mismatch.status).toBe(422);
        expect(mismatch.body['type']).toBe('imports.currency_mismatch');
    });

    it('isolamento entre empresas', async () => {
        const a: Account = await harness.signUp('iso-a');
        const b: Account = await harness.signUp('iso-b');
        const file: Buffer = fixture('bb-conta-2.ofx');
        const mine = await send(a.token, '/spending/imports', file, { format: 'ofx', newAccountName: 'BB', newAccountKind: 'checking' });

        const foreign = await send(b.token, '/spending/imports', file, { format: 'ofx', accountId: String(mine.body['accountId']) });
        const list = await harness.call<{ data: unknown[] }>(b.token, 'GET', '/spending/imports');
        const undo = await harness.call<{ type: string }>(b.token, 'DELETE', `/spending/imports/${String(mine.body['id'])}`);
        const preview = await send(b.token, '/spending/imports/preview', file);

        expect(foreign.status).toBe(404);
        expect(list.body.data).toEqual([]);
        expect(undo.status).toBe(404);
        expect(preview.body['alreadyImportedAt']).toBeNull();
    });

    it('a 21ª importação na hora é 429', async () => {
        const owner: Account = await harness.signUp('rate');
        const file: Buffer = fixture('nubank-conta.csv');
        const first = await send(owner.token, '/spending/imports', file, {
            format: 'csv_nubank_account',
            newAccountName: 'N',
            newAccountKind: 'checking'
        });
        const accountId: string = String(first.body['accountId']);
        const statuses: number[] = [];
        for (let index = 0; index < 20; index += 1) {
            statuses.push((await send(owner.token, '/spending/imports', file, { format: 'csv_nubank_account', accountId })).status);
        }
        expect(statuses.slice(0, 19)).toEqual(Array(19).fill(201));
        expect(statuses[19]).toBe(429);
    });
});
