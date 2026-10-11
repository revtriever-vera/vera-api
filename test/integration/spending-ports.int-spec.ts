import { AddressInfo, Server } from 'node:net';
import { DiscoveryService } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OnboardingAreaSummaryPort } from '../../src/modules/onboarding/services/onboarding-area-summary.port';
import { SpendingDatasetService } from '../../src/modules/transactions/services/spending-dataset.service';
import { DateUtil } from '../../src/shared/utils/date.util';
import { fixture } from '../support/statement-fixtures';
import { Account, AllocationHarness } from './support/allocation-harness';
import { CapturingPublisher } from './support/queue';

const CLIENT_ID: string = '3f9a1b2c-4d5e-4f60-8a9b-c2e1d3f4a5b6';
const SECRET: string = 'vera-sentinel-1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const NUBANK_ITEM: string = '00000000-0000-4000-8000-00000000a001';
const DATASET_SIZE: number = new SpendingDatasetService().build(DateUtil.todayInBrazil()).transactions.length;

interface SummaryBody {
    readonly banks: {
        readonly items: number;
        readonly amountCents: number | null;
        readonly currency: string | null;
        readonly breakdown: { readonly connections: number; readonly imports: number };
    } | null;
}

interface SpendingSummaryBody {
    readonly hasData: boolean;
    readonly expensesMinor: number;
    readonly income: { readonly minor: number };
}

interface ExportBody {
    readonly sections: Record<string, unknown>;
}

interface CategoriesBody {
    readonly categories: { readonly id: string; readonly systemKey: string | null }[];
}

describe('spending ports', () => {
    let harness: AllocationHarness;
    let origin: string;

    beforeAll(async () => {
        harness = await AllocationHarness.start('spending_ports', new CapturingPublisher());
        const address: AddressInfo = (harness.app.getHttpServer() as Server).address() as AddressInfo;
        origin = `http://127.0.0.1:${String(address.port)}`;
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function importOfx(owner: Account, name: string, accountId: string | null = null): Promise<number> {
        const form: FormData = new FormData();
        form.append('format', 'ofx');
        if (accountId === null) {
            form.append('newAccountName', 'Conta real');
            form.append('newAccountKind', 'credit_card');
        } else {
            form.append('accountId', accountId);
        }
        form.append('file', new Blob([new Uint8Array(fixture(name))]), name);
        const response: Response = await fetch(`${origin}/spending/imports`, {
            method: 'POST',
            body: form,
            headers: { authorization: `Bearer ${owner.token}` }
        });
        return response.status;
    }

    async function count(owner: Account, table: string, where: string = 'TRUE'): Promise<number> {
        const result = await harness.pg.query<{ total: string }>(
            `SELECT count(*) AS total FROM "${table}" WHERE "companyId" = $1 AND "deletedAt" IS NULL AND ${where}`,
            [owner.company.id]
        );
        return Number(result.rows[0]?.total);
    }

    async function onboarding(owner: Account): Promise<SummaryBody> {
        return (await harness.call<SummaryBody>(owner.token, 'GET', '/onboarding/summary')).body;
    }

    it('só uma porta registra a área banks', () => {
        const ports: OnboardingAreaSummaryPort[] = harness.app
            .get(DiscoveryService)
            .getProviders()
            .map((wrapper) => wrapper.instance as unknown)
            .filter((instance: unknown): instance is OnboardingAreaSummaryPort => instance instanceof OnboardingAreaSummaryPort)
            .filter((port: OnboardingAreaSummaryPort): boolean => port.area === 'banks');

        expect(ports).toHaveLength(1);
    });

    it('resumo banks: sem nada vem zerado, depois de uma conexão e um extrato vem 1 e 1', async () => {
        const owner: Account = await harness.signUp('banks');
        expect((await onboarding(owner)).banks).toEqual({
            items: 0,
            amountCents: null,
            currency: null,
            breakdown: { connections: 0, imports: 0 }
        });

        await harness.call(owner.token, 'PUT', '/spending/connections/credentials', { clientId: CLIENT_ID, clientSecret: SECRET });
        const connected = await harness.call(owner.token, 'POST', '/spending/connections', { itemIds: [NUBANK_ITEM] });
        expect(connected.status).toBe(200);
        expect(await importOfx(owner, 'nubank-cartao-1.02.ofx')).toBe(201);

        expect((await onboarding(owner)).banks).toEqual({
            items: 2,
            amountCents: null,
            currency: null,
            breakdown: { connections: 1, imports: 1 }
        });
    });

    it('exemplo: carrega o conjunto canônico, o resumo M-1 bate e o exemplo não conta como banco', async () => {
        const owner: Account = await harness.signUp('sample');

        expect((await harness.call(owner.token, 'POST', '/onboarding/sample')).status).toBe(200);

        expect(await count(owner, 'Transactions', '"isSample" = true')).toBe(DATASET_SIZE);
        expect(await count(owner, 'Transactions', '"isSample" = false')).toBe(0);
        expect(await count(owner, 'FinancialAccounts', '"isSample" = true')).toBe(3);
        const names = await harness.pg.query<{ name: string }>(
            'SELECT "name" FROM "FinancialAccounts" WHERE "companyId" = $1 AND "deletedAt" IS NULL ORDER BY "name"',
            [owner.company.id]
        );
        expect(names.rows.map((row) => row.name)).toEqual(['Cartão de exemplo', 'Conta 2 de exemplo', 'Conta de exemplo']);
        const summary = await harness.call<SpendingSummaryBody>(owner.token, 'GET', '/spending/summary');
        expect(summary.body).toMatchObject({ hasData: true, expensesMinor: 2_464_000, income: { minor: 2_800_000 } });
        expect((await onboarding(owner)).banks?.breakdown).toEqual({ connections: 0, imports: 0 });

        await harness.call(owner.token, 'POST', '/onboarding/sample');
        expect(await count(owner, 'Transactions')).toBe(DATASET_SIZE);

        expect((await harness.call(owner.token, 'DELETE', '/onboarding/sample')).status).toBe(200);
        expect((await harness.call(owner.token, 'DELETE', '/onboarding/sample')).status).toBe(200);

        expect(await count(owner, 'Transactions')).toBe(0);
        expect(await count(owner, 'FinancialAccounts')).toBe(0);
        const cleared = await harness.call<SpendingSummaryBody>(owner.token, 'GET', '/spending/summary');
        expect(cleared.body.hasData).toBe(false);
        const categories = await harness.call<CategoriesBody>(owner.token, 'GET', '/spending/categories');
        expect(categories.body.categories.length).toBeGreaterThan(0);
    });

    it('a regra criada a partir de uma transação de exemplo nasce como exemplo e some ao limpar', async () => {
        const owner: Account = await harness.signUp('sample-rule');
        await harness.call(owner.token, 'POST', '/onboarding/sample');
        const target = await harness.pg.query<{ id: string }>(
            `SELECT "id" FROM "Transactions" WHERE "companyId" = $1 AND "counterpartyKey" IS NOT NULL AND "deletedAt" IS NULL ORDER BY "date" LIMIT 1`,
            [owner.company.id]
        );
        const categories = await harness.call<CategoriesBody>(owner.token, 'GET', '/spending/categories');
        const leisure: string = categories.body.categories.find((item) => item.systemKey === 'leisure')?.id ?? '';

        const patched = await harness.call(owner.token, 'PATCH', `/spending/transactions/${target.rows[0]?.id ?? ''}`, {
            categoryId: leisure,
            rule: { scope: 'counterparty' }
        });

        expect(patched.status).toBe(200);
        expect(await count(owner, 'CategoryRules', '"isSample" = true')).toBe(1);
        expect(await count(owner, 'CategoryRules', '"isSample" = false')).toBe(0);

        await harness.call(owner.token, 'DELETE', '/onboarding/sample');

        expect(await count(owner, 'CategoryRules')).toBe(0);
    });

    it('com dado real o exemplo não grava, e limpar nunca toca o que é real', async () => {
        const blocked: Account = await harness.signUp('blocked');
        expect(await importOfx(blocked, 'nubank-cartao-1.02.ofx')).toBe(201);

        expect((await harness.call(blocked.token, 'POST', '/onboarding/sample')).status).toBe(200);

        expect(await count(blocked, 'Transactions', '"isSample" = true')).toBe(0);
        expect(await count(blocked, 'Transactions')).toBe(4);

        const mixed: Account = await harness.signUp('mixed');
        await harness.call(mixed.token, 'POST', '/onboarding/sample');
        expect(await importOfx(mixed, 'nubank-cartao-1.02.ofx')).toBe(201);

        expect((await harness.call(mixed.token, 'DELETE', '/onboarding/sample')).status).toBe(200);

        expect(await count(mixed, 'Transactions', '"isSample" = true')).toBe(0);
        expect(await count(mixed, 'Transactions')).toBe(4);
        expect(await count(mixed, 'FinancialAccounts')).toBe(1);
    });

    it('extrato real importado numa conta de exemplo: limpar promove a conta e a exportação a inclui', async () => {
        const owner: Account = await harness.signUp('promote');
        await harness.call(owner.token, 'POST', '/onboarding/sample');
        const card = await harness.pg.query<{ id: string }>(
            'SELECT "id" FROM "FinancialAccounts" WHERE "companyId" = $1 AND "name" = $2 AND "deletedAt" IS NULL',
            [owner.company.id, 'Cartão de exemplo']
        );
        expect(await importOfx(owner, 'nubank-cartao-1.02.ofx', card.rows[0]?.id ?? '')).toBe(201);

        expect((await harness.call(owner.token, 'DELETE', '/onboarding/sample')).status).toBe(200);

        expect(await count(owner, 'FinancialAccounts', '"isSample" = false')).toBe(1);
        expect(await count(owner, 'FinancialAccounts', '"isSample" = true')).toBe(0);
        expect(await count(owner, 'Transactions')).toBe(4);
        const exported = await harness.call<ExportBody>(owner.token, 'GET', '/account/export');
        const section = exported.body.sections['transactions'] as { accounts: { name: string }[]; transactions: { account: string }[] };
        expect(section.accounts.map((item) => item.name)).toEqual(['Cartão de exemplo']);
        expect(section.transactions).toHaveLength(4);
        expect(section.transactions.every((item) => item.account === 'Cartão de exemplo')).toBe(true);
    });

    it('exportação traz as quatro seções, só do que é real, sem segredo, hash nem marca de exemplo', async () => {
        const owner: Account = await harness.signUp('export');
        const other: Account = await harness.signUp('export-other');
        await harness.call(owner.token, 'PUT', '/spending/connections/credentials', { clientId: CLIENT_ID, clientSecret: SECRET });
        await harness.call(owner.token, 'POST', '/spending/connections', { itemIds: [NUBANK_ITEM] });
        await harness.call(owner.token, 'PUT', '/spending/settings', { savingsGoalBps: 1500 });
        expect(await importOfx(owner, 'nubank-cartao-1.02.ofx')).toBe(201);
        expect(await importOfx(other, 'itau-conta-1.02.ofx')).toBe(201);
        const categories = await harness.call<CategoriesBody>(owner.token, 'GET', '/spending/categories');
        const leisure: string = categories.body.categories.find((item) => item.systemKey === 'leisure')?.id ?? '';
        const descriptionRule = await harness.pg.query<{ id: string }>(
            `SELECT "id" FROM "Transactions" WHERE "companyId" = $1 ORDER BY "id" LIMIT 1`,
            [owner.company.id]
        );
        await harness.call(owner.token, 'PATCH', `/spending/transactions/${descriptionRule.rows[0]?.id ?? ''}`, {
            categoryId: leisure,
            rule: { scope: 'description' }
        });

        const response = await harness.call<ExportBody>(owner.token, 'GET', '/account/export');

        expect(response.status).toBe(200);
        const sections: Record<string, unknown> = response.body.sections;
        expect(Object.keys(sections)).toEqual(
            expect.arrayContaining(['spending_categories', 'transactions', 'spending_settings', 'bank_connections'])
        );
        const rules = (
            sections['spending_categories'] as { rules: { matchType: string; pattern: string | null; categoryKey: string | null }[] }
        ).rules;
        expect(rules).toHaveLength(1);
        expect(rules[0]).toMatchObject({ matchType: 'description', categoryKey: 'leisure' });
        expect(sections['spending_settings']).toEqual({ savingsGoalBps: 1500, incomeMode: 'transactions', declaredIncomeMinor: null });
        const exported = sections['transactions'] as { accounts: unknown[]; transactions: unknown[]; imports: unknown[] };
        expect(exported.accounts).toHaveLength(1);
        expect(exported.transactions).toHaveLength(4);
        expect(exported.imports).toHaveLength(1);
        const text: string = JSON.stringify(response.body);
        expect(text).not.toContain(SECRET);
        expect(text).not.toContain(CLIENT_ID);
        expect(text).not.toMatch(/[0-9a-f]{64}/);
        expect(text).not.toContain('isSample');
        expect(text).not.toContain(other.company.id);
    });

    it('a exportação deixa o exemplo de fora', async () => {
        const owner: Account = await harness.signUp('export-sample');
        await harness.call(owner.token, 'POST', '/onboarding/sample');

        const response = await harness.call<ExportBody>(owner.token, 'GET', '/account/export');

        expect(response.body.sections['transactions']).toEqual({ accounts: [], transactions: [], imports: [] });
    });
});
