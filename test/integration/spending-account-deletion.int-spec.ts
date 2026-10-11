import { AddressInfo, Server } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tablesWithCompanyId } from './support/company-cascade';
import { fixture } from '../support/statement-fixtures';
import { Account, AllocationHarness } from './support/allocation-harness';
import { CapturingPublisher } from './support/queue';

const CLIENT_ID: string = '3f9a1b2c-4d5e-4f60-8a9b-c2e1d3f4a5b6';
const SECRET: string = 'vera-sentinel-1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const NUBANK_ITEM: string = '00000000-0000-4000-8000-00000000a001';
const SPENDING_TABLES: readonly string[] = [
    'BankConnectionAccounts',
    'BankConnections',
    'BankSyncRuns',
    'CategoryRules',
    'FinancialAccounts',
    'PluggyCredentials',
    'SpendingCategories',
    'SpendingSettings',
    'TransactionImports',
    'Transactions'
];

describe('spending account deletion', () => {
    let harness: AllocationHarness;
    let origin: string;

    beforeAll(async () => {
        harness = await AllocationHarness.start('spending_deletion', new CapturingPublisher());
        const address: AddressInfo = (harness.app.getHttpServer() as Server).address() as AddressInfo;
        origin = `http://127.0.0.1:${String(address.port)}`;
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function populate(owner: Account): Promise<void> {
        await harness.call(owner.token, 'PUT', '/spending/connections/credentials', { clientId: CLIENT_ID, clientSecret: SECRET });
        await harness.call(owner.token, 'POST', '/spending/connections', { itemIds: [NUBANK_ITEM] });
        await harness.call(owner.token, 'PUT', '/spending/settings', { savingsGoalBps: 1500 });
        const form: FormData = new FormData();
        form.append('format', 'ofx');
        form.append('newAccountName', 'Conta real');
        form.append('newAccountKind', 'credit_card');
        form.append('file', new Blob([new Uint8Array(fixture('nubank-cartao-1.02.ofx'))]), 'extrato.ofx');
        const imported: Response = await fetch(`${origin}/spending/imports`, {
            method: 'POST',
            body: form,
            headers: { authorization: `Bearer ${owner.token}` }
        });
        expect(imported.status).toBe(201);
        const categories = await harness.call<{ categories: { id: string; systemKey: string | null }[] }>(
            owner.token,
            'GET',
            '/spending/categories'
        );
        await linkSync(owner);
        const target: string = await firstTransaction(owner);
        await harness.call(owner.token, 'PATCH', `/spending/transactions/${target}`, {
            categoryId: categories.body.categories.find((item) => item.systemKey === 'leisure')?.id,
            rule: { scope: 'description' }
        });
    }

    async function linkSync(owner: Account): Promise<void> {
        const connection = await harness.pg.query<{ id: string }>('SELECT "id" FROM "BankConnections" WHERE "companyId" = $1 LIMIT 1', [
            owner.company.id
        ]);
        const account = await harness.pg.query<{ id: string }>('SELECT "id" FROM "FinancialAccounts" WHERE "companyId" = $1 LIMIT 1', [
            owner.company.id
        ]);
        await harness.pg.query(
            `INSERT INTO "BankConnectionAccounts" ("id", "companyId", "connectionId", "accountId", "externalAccountId")
             VALUES (gen_random_uuid(), $1, $2, $3, 'external-account')`,
            [owner.company.id, connection.rows[0]?.id, account.rows[0]?.id]
        );
        await harness.pg.query(
            `INSERT INTO "BankSyncRuns" ("id", "companyId", "connectionId", "trigger", "status")
             VALUES (gen_random_uuid(), $1, $2, 'initial', 'succeeded')`,
            [owner.company.id, connection.rows[0]?.id]
        );
    }

    async function firstTransaction(owner: Account): Promise<string> {
        const rows = await harness.pg.query<{ id: string }>('SELECT "id" FROM "Transactions" WHERE "companyId" = $1 LIMIT 1', [
            owner.company.id
        ]);
        return rows.rows[0]?.id ?? '';
    }

    async function countsOf(owner: Account): Promise<Record<string, number>> {
        const counts: Record<string, number> = {};
        for (const table of SPENDING_TABLES) {
            const result = await harness.pg.query<{ total: string }>(`SELECT count(*) AS total FROM "${table}" WHERE "companyId" = $1`, [
                owner.company.id
            ]);
            counts[table] = Number(result.rows[0]?.total);
        }
        return counts;
    }

    it('as dez tabelas de gastos têm companyId', async () => {
        const tables: string[] = await tablesWithCompanyId(harness.pg);

        expect(tables).toEqual(expect.arrayContaining([...SPENDING_TABLES]));
    });

    it('excluir a conta apaga tudo de gastos da company e deixa a outra intacta', async () => {
        const a: Account = await harness.signUp('a');
        const b: Account = await harness.signUp('b');
        await populate(a);
        await populate(b);
        await harness.call(a.token, 'POST', '/onboarding/sample');
        const beforeA: Record<string, number> = await countsOf(a);
        const beforeB: Record<string, number> = await countsOf(b);
        for (const table of SPENDING_TABLES) {
            expect(beforeA[table], table).toBeGreaterThan(0);
        }

        const response: Response = await fetch(`${origin}/account`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${a.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ confirmEmail: a.user.email })
        });

        expect(response.status).toBe(204);
        const afterA: Record<string, number> = await countsOf(a);
        for (const table of SPENDING_TABLES) {
            expect(afterA[table], table).toBe(0);
        }
        expect(await countsOf(b)).toEqual(beforeB);
    });
});
