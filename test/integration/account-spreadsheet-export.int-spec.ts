import { Workbook, Worksheet } from 'exceljs';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IncomingTransaction } from '../../src/modules/transactions/domain/transactions.types';
import { FinancialAccountService } from '../../src/modules/transactions/services/financial-account.service';
import { TransactionIngestionService } from '../../src/modules/transactions/services/transaction-ingestion.service';
import { asRole } from '../support/as-role';
import { Account, AllocationHarness, RawResponse } from './support/allocation-harness';

const PATH: string = '/account/export/spreadsheets';
const EXPORTS_PER_HOUR: number = 3;

interface CategoryBody {
    readonly id: string;
}

describe('account spreadsheet export', () => {
    let harness: AllocationHarness;
    let ingestion: TransactionIngestionService;
    let accounts: FinancialAccountService;

    beforeAll(async () => {
        harness = await AllocationHarness.start('account_spreadsheets');
        ingestion = harness.app.get(TransactionIngestionService, { strict: false });
        accounts = harness.app.get(FinancialAccountService, { strict: false });
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function seed(owner: Account, tag: string): Promise<void> {
        const created = await harness.inCompany(owner.company.id, async () =>
            accounts.upsertProviderAccount({
                provider: 'pluggy',
                externalId: `acc-${tag}`,
                kind: 'checking',
                name: `Conta ${tag}`,
                institutionName: 'Banco',
                numberLast4: '1234',
                currency: 'BRL'
            })
        );
        const items: IncomingTransaction[] = [
            {
                externalId: `pluggy:${tag}-1`,
                date: '2026-09-05',
                amountMinor: -12_345,
                currency: 'BRL',
                description: `compra ${tag}`,
                counterpartyName: null,
                counterpartyDocument: null,
                providerCategoryId: null
            },
            {
                externalId: `pluggy:${tag}-2`,
                date: '2026-09-06',
                amountMinor: 500_000,
                currency: 'BRL',
                description: `=salario ${tag}`,
                counterpartyName: null,
                counterpartyDocument: null,
                providerCategoryId: null
            }
        ];
        await harness.inCompany(owner.company.id, async () => ingestion.ingest({ accountId: created.id, source: 'pluggy', items }));
        const category = await harness.call<CategoryBody>(owner.token, 'POST', '/spending/categories', {
            name: `Pets ${tag}`,
            kind: 'expense',
            flexibility: 'flexible',
            icon: 'Home'
        });
        await harness.call(owner.token, 'POST', '/spending/rules', {
            matchType: 'contains',
            pattern: `petz ${tag}`,
            appliesTo: 'out',
            categoryId: category.body.id
        });
    }

    async function markRecurring(owner: Account, externalId: string): Promise<void> {
        const found = await harness.pg.query<{ id: string }>(
            `SELECT "id" FROM "Transactions" WHERE "companyId" = $1 AND "externalId" = $2`,
            [owner.company.id, externalId]
        );
        const created = await harness.call(owner.token, 'POST', '/spending/recurring', { fromTransactionId: found.rows[0]?.id });
        expect(created.status).toBe(201);
    }

    async function zipOf(response: RawResponse): Promise<JSZip> {
        return JSZip.loadAsync(response.bytes);
    }

    async function sheetsOf(zip: JSZip, file: string): Promise<Worksheet[]> {
        const workbook: Workbook = new Workbook();
        await workbook.xlsx.load(
            (await (zip.file(file) as JSZip.JSZipObject).async('nodebuffer')) as unknown as Parameters<Workbook['xlsx']['load']>[0]
        );
        return workbook.worksheets;
    }

    function textsOf(sheet: Worksheet): string[] {
        const texts: string[] = [];
        sheet.eachRow((row) => {
            row.eachCell((cell) => {
                texts.push(cell.text);
            });
        });
        return texts;
    }

    it('devolve o zip com planilhas e dados.json, só da company de quem pede, e a quarta chamada na hora dá 429', async () => {
        const a: Account = await harness.signUp('zip-a');
        const b: Account = await harness.signUp('zip-b');
        await seed(a, 'aaa');
        await seed(b, 'qzq');
        await markRecurring(a, 'pluggy:aaa-1');
        await markRecurring(b, 'pluggy:qzq-1');

        const response: RawResponse = await harness.callRaw(a.token, PATH);

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('application/zip');
        expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="vera-meus-dados-\d{4}-\d{2}-\d{2}\.zip"$/);
        const zip: JSZip = await zipOf(response);
        expect(Object.keys(zip.files).sort()).toEqual([
            'agenda.xlsx',
            'assinaturas-e-contas.xlsx',
            'carteira.xlsx',
            'dados.json',
            'lembretes.xlsx',
            'metas.xlsx',
            'objetivos.xlsx',
            'regras.xlsx',
            'transacoes.xlsx'
        ]);
        const transactions: string[] = textsOf((await sheetsOf(zip, 'transacoes.xlsx'))[0] as Worksheet);
        expect(transactions).toContain('compra aaa');
        expect(transactions).toContain("'=salario aaa");
        expect(transactions.join('|')).not.toContain('qzq');
        const rules: string[] = textsOf((await sheetsOf(zip, 'regras.xlsx'))[0] as Worksheet);
        expect(rules).toContain('petz aaa');
        expect(rules.join('|')).not.toContain('qzq');
        const recurring: Worksheet[] = await sheetsOf(zip, 'assinaturas-e-contas.xlsx');
        expect(recurring.map((sheet: Worksheet) => sheet.name)).toEqual(['Assinaturas e contas']);
        const recurringTexts: string[] = textsOf(recurring[0] as Worksheet);
        expect(recurringTexts).toContain('Compra Aaa');
        expect(recurringTexts).toContain('Confirmada');
        expect(recurringTexts.join('|')).not.toContain('qzq');
        const goals: Worksheet[] = await sheetsOf(zip, 'metas.xlsx');
        expect(goals.map((sheet: Worksheet) => sheet.name)).toEqual(['Classes', 'Metas por ativo', 'Preferências']);
        const json: {
            format: string;
            account: { company: { name: string } };
            sections: { recurring: { series: { name: string; account: string; charges: unknown[] }[] } };
        } = JSON.parse(await (zip.file('dados.json') as JSZip.JSZipObject).async('string'));
        expect(json.format).toBe('vera-export/1');
        expect(json.account.company.name).toBe('Empresa zip-a');
        expect(json.sections.recurring.series.map((item) => [item.name, item.account])).toEqual([['Compra Aaa', 'Conta aaa']]);
        expect(json.sections.recurring.series[0]?.charges).toHaveLength(1);
        expect(JSON.stringify(json)).not.toContain('qzq');

        for (let call: number = 1; call < EXPORTS_PER_HOUR; call += 1) {
            expect((await harness.callRaw(a.token, PATH)).status).toBe(200);
        }
        const limited: RawResponse = await harness.callRaw(a.token, PATH);
        expect(limited.status).toBe(429);
        expect((JSON.parse(limited.bytes.toString('utf8')) as { type: string }).type).toBe('core.too_many_attempts');
        expect((await harness.callRaw(b.token, PATH)).status).toBe(200);
    });

    it('não leva dados de exemplo e recusa quem não é owner ou não está logado', async () => {
        const owner: Account = await harness.signUp('zip-sample');
        const sample = await harness.call(owner.token, 'POST', '/onboarding/sample');
        const viewer: Account = await asRole(harness, owner, 'viewer');

        const response: RawResponse = await harness.callRaw(owner.token, PATH);

        expect([200, 201, 204]).toContain(sample.status);
        const zip: JSZip = await zipOf(response);
        const transactions: Worksheet = (await sheetsOf(zip, 'transacoes.xlsx'))[0] as Worksheet;
        expect(transactions.rowCount).toBe(1);
        expect((await sheetsOf(zip, 'carteira.xlsx'))[0]?.rowCount).toBe(1);
        expect((await sheetsOf(zip, 'assinaturas-e-contas.xlsx'))[0]?.rowCount).toBe(1);
        expect((await harness.callRaw(viewer.token, PATH)).status).toBe(403);
        expect((await harness.callRaw(null, PATH)).status).toBe(401);
    });
});
