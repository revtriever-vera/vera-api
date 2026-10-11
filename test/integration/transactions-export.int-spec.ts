import { Row, Workbook, Worksheet } from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthTokens, SessionIssuerPort } from '../../src/modules/identity/ports/session-issuer.port';
import { IncomingTransaction } from '../../src/modules/transactions/domain/transactions.types';
import { FinancialAccountService } from '../../src/modules/transactions/services/financial-account.service';
import { SpendingDatasetService } from '../../src/modules/transactions/services/spending-dataset.service';
import { TransactionIngestionService } from '../../src/modules/transactions/services/transaction-ingestion.service';
import { DateUtil } from '../../src/shared/utils/date.util';
import { Account, AllocationHarness, RawResponse } from './support/allocation-harness';

const BOM: string = '﻿';
const EXPORT_PATH: string = '/spending/transactions/export';
const XLSX_TYPE: string = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const EXPORTS_PER_MINUTE: number = 10;
const MAX_ROWS: number = 50_000;
const DATASET_TODAY: string = '2026-10-11';
const CLOSED_MONTH: string = '2026-09';
const TODAY: string = DateUtil.todayInBrazil();

interface CategoryBody {
    readonly id: string;
    readonly systemKey: string | null;
}

interface ProblemBody {
    readonly type: string;
    readonly meta?: { readonly rows?: number };
}

describe('transactions export', () => {
    let harness: AllocationHarness;
    let ingestion: TransactionIngestionService;
    let accounts: FinancialAccountService;

    beforeAll(async () => {
        harness = await AllocationHarness.start('transactions_export');
        ingestion = harness.app.get(TransactionIngestionService, { strict: false });
        accounts = harness.app.get(FinancialAccountService, { strict: false });
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function seedCanonical(owner: Account): Promise<Map<string, string>> {
        const dataset = new SpendingDatasetService().build(DATASET_TODAY);
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
            await harness.inCompany(owner.company.id, async () => ingestion.ingest({ accountId: created.id, source: 'pluggy', items }));
        }
        return ids;
    }

    async function canonicalAccount(label: string): Promise<{ owner: Account; ids: Map<string, string> }> {
        const owner: Account = await harness.signUp(label);
        return { owner, ids: await seedCanonical(owner) };
    }

    async function download(owner: Account, query: string): Promise<RawResponse> {
        return harness.callRaw(owner.token, `${EXPORT_PATH}?${query}`);
    }

    async function englishToken(owner: Account): Promise<string> {
        await harness.pg.query(`UPDATE "Users" SET "locale" = 'en' WHERE "id" = $1`, [owner.user.id]);
        const issuer: SessionIssuerPort = harness.app.get(SessionIssuerPort, { strict: false });
        const tokens: AuthTokens = await harness.inCompany(owner.company.id, async () =>
            issuer.issueForNewLogin({ ...owner.user, locale: 'en' }, { ip: '203.0.113.7', userAgent: 'int-test' }, 'google')
        );
        return tokens.accessToken;
    }

    function linesOf(response: RawResponse): string[] {
        return response.bytes
            .toString('utf8')
            .split('\r\n')
            .filter((line: string) => line.length > 0);
    }

    function amountOf(line: string): number {
        return Math.round(Number((line.split(';')[3] as string).replace(',', '.')) * 100);
    }

    async function sheetOf(response: RawResponse): Promise<Worksheet> {
        const workbook: Workbook = new Workbook();
        await workbook.xlsx.load(response.bytes as unknown as Parameters<Workbook['xlsx']['load']>[0]);
        return workbook.worksheets[0] as Worksheet;
    }

    it('exporta o csv de setembro em pt-BR, cronológico, com 29 linhas somando R$ 1.360 e os dois Pix sem categoria', async () => {
        const { owner } = await canonicalAccount('csv-ptbr');

        const response: RawResponse = await download(owner, `format=csv&month=${CLOSED_MONTH}`);

        expect(response.status).toBe(200);
        expect(response.bytes.toString('utf8').startsWith(BOM)).toBe(true);
        const lines: string[] = linesOf(response);
        expect(lines[0]).toBe(`${BOM}Data;Descrição;Favorecido;Valor;Moeda;Categoria;Origem da categoria;Conta;Instituição;Fonte`);
        const body: string[] = lines.slice(1);
        expect(body).toHaveLength(29);
        const dates: string[] = body.map((line: string) => (line.split(';')[0] as string).split('/').reverse().join('-'));
        expect(dates).toEqual([...dates].sort());
        expect(dates.every((date: string) => date.startsWith(CLOSED_MONTH))).toBe(true);
        expect(body.reduce((sum: number, line: string) => sum + amountOf(line), 0)).toBe(136_000);
        const spendingAndNone: number = body
            .filter((line: string) => !['Renda', 'Investimentos'].includes(line.split(';')[5] as string))
            .reduce((sum: number, line: string) => sum + amountOf(line), 0);
        expect(spendingAndNone).toBe(-2_464_000);
        const pix: string[] = body.filter((line: string) => line.includes('Pix enviado'));
        expect(pix).toHaveLength(2);
        pix.forEach((line: string) => {
            expect(line.split(';')[5]).toBe('Sem categoria');
            expect(line.split(';')[6]).toBe('—');
        });
        expect(body.some((line: string) => /;Moradia;/.test(line))).toBe(true);
        expect(body.some((line: string) => /;Open Finance \(Meu Pluggy\)$/.test(line))).toBe(true);
    });

    it('exporta o xlsx com valor numérico, data como data e formato de moeda', async () => {
        const { owner } = await canonicalAccount('xlsx');

        const response: RawResponse = await download(owner, `format=xlsx&month=${CLOSED_MONTH}`);

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe(XLSX_TYPE);
        const sheet: Worksheet = await sheetOf(response);
        expect(sheet.name).toBe('Transações');
        expect(sheet.rowCount).toBe(30);
        expect(sheet.getRow(1).values).toEqual([
            undefined,
            'Data',
            'Descrição',
            'Favorecido',
            'Valor',
            'Moeda',
            'Categoria',
            'Origem da categoria',
            'Conta',
            'Instituição',
            'Fonte'
        ]);
        let total: number = 0;
        for (let index: number = 2; index <= 30; index++) {
            const row: Row = sheet.getRow(index);
            expect(row.getCell(1).value).toBeInstanceOf(Date);
            expect(row.getCell(1).numFmt).toBe('dd/mm/yyyy');
            expect(typeof row.getCell(4).value).toBe('number');
            expect(row.getCell(4).numFmt).toBe('"R$" #,##0.00');
            total += row.getCell(4).value as number;
        }
        expect(Math.round(total * 100)).toBe(136_000);
        const first: Date = sheet.getRow(2).getCell(1).value as Date;
        expect(first.toISOString().slice(0, 7)).toBe(CLOSED_MONTH);
    });

    it('filtra por categoria, sem categoria, direção, busca e intervalo', async () => {
        const { owner } = await canonicalAccount('filters');
        const categories = (await harness.call<{ categories: CategoryBody[] }>(owner.token, 'GET', '/spending/categories')).body.categories;
        const housing: CategoryBody = categories.find((category: CategoryBody) => category.systemKey === 'housing') as CategoryBody;

        const byCategory: string[] = linesOf(await download(owner, `format=csv&month=${CLOSED_MONTH}&categoryId=${housing.id}`)).slice(1);
        const uncategorized: string[] = linesOf(await download(owner, `format=csv&month=${CLOSED_MONTH}&uncategorized=true`)).slice(1);
        const incoming: string[] = linesOf(await download(owner, `format=csv&month=${CLOSED_MONTH}&direction=in`)).slice(1);
        const search: string[] = linesOf(await download(owner, `format=csv&month=${CLOSED_MONTH}&q=maria`)).slice(1);
        const range: string[] = linesOf(await download(owner, `format=csv&from=${CLOSED_MONTH}-01&to=${CLOSED_MONTH}-15`)).slice(1);

        expect(byCategory.length).toBeGreaterThan(0);
        byCategory.forEach((line: string) => {
            expect(line.split(';')[5]).toBe('Moradia');
        });
        expect(uncategorized.length).toBeGreaterThanOrEqual(2);
        uncategorized.forEach((line: string) => {
            expect(line.split(';')[5]).toBe('Sem categoria');
        });
        incoming.forEach((line: string) => {
            expect(amountOf(line)).toBeGreaterThan(0);
        });
        expect(search.length).toBeGreaterThan(0);
        search.forEach((line: string) => {
            expect(line.toLowerCase()).toContain('maria');
        });
        expect(range.length).toBeGreaterThan(0);
        expect(range.length).toBeLessThan(29);
        range.forEach((line: string) => {
            expect(Number((line.split(';')[0] as string).slice(0, 2))).toBeLessThanOrEqual(15);
        });
    });

    it('filtra por conta e devolve 404 para conta que não é da company', async () => {
        const { owner, ids } = await canonicalAccount('by-account');
        const other: { owner: Account; ids: Map<string, string> } = await canonicalAccount('by-account-other');

        const itau: string[] = linesOf(
            await download(owner, `format=csv&month=${CLOSED_MONTH}&accountId=${ids.get('itau-checking') as string}`)
        ).slice(1);
        const foreign: RawResponse = await download(owner, `format=csv&accountId=${other.ids.get('itau-checking') as string}`);

        expect(itau.length).toBeGreaterThan(0);
        itau.forEach((line: string) => {
            expect(line.split(';')[7]).toBe('Itaú Conta Corrente');
        });
        expect(foreign.status).toBe(404);
        expect((JSON.parse(foreign.bytes.toString('utf8')) as ProblemBody).type).toBe('transactions.account_not_found');
    });

    it('usa cabeçalhos, categorias, datas e decimais em inglês quando o idioma da sessão é en', async () => {
        const { owner } = await canonicalAccount('english');
        const token: string = await englishToken(owner);

        const response: RawResponse = await harness.callRaw(token, `${EXPORT_PATH}?format=csv&month=${CLOSED_MONTH}`);

        const lines: string[] = linesOf(response);
        expect(lines[0]).toBe(`${BOM}Date,Description,Counterparty,Amount,Currency,Category,Category source,Account,Institution,Source`);
        expect(lines.some((line: string) => line.includes(',Housing,'))).toBe(true);
        expect(lines.some((line: string) => line.includes(',Uncategorized,—,'))).toBe(true);
        expect(lines.some((line: string) => line.startsWith(`${CLOSED_MONTH}-`) && line.includes(',-350.00,'))).toBe(true);
    });

    it('isola as companies: o arquivo da B não tem nenhuma linha da A e sem id interno', async () => {
        const companyA: Account = await harness.signUp('isolation-a');
        const companyB: Account = await harness.signUp('isolation-b');
        const accountA: string = (
            await harness.inCompany(companyA.company.id, async () =>
                accounts.createFileAccount({ kind: 'checking', name: 'Conta Exclusiva da A', currency: 'BRL' })
            )
        ).id;
        await harness.inCompany(companyA.company.id, async () =>
            ingestion.ingest({
                accountId: accountA,
                source: 'ofx',
                items: [
                    {
                        externalId: 'a-1',
                        date: `${CLOSED_MONTH}-10`,
                        amountMinor: -1234,
                        currency: 'BRL',
                        description: 'COMPRA EXCLUSIVA A'
                    }
                ]
            })
        );
        await seedCanonical(companyB);

        const fileA: string = (await download(companyA, `format=csv&month=${CLOSED_MONTH}`)).bytes.toString('utf8');
        const fileB: string = (await download(companyB, `format=csv&month=${CLOSED_MONTH}`)).bytes.toString('utf8');

        expect(fileA).toContain('COMPRA EXCLUSIVA A');
        expect(fileA).toContain('Conta Exclusiva da A');
        expect(fileA).toContain('Arquivo OFX');
        expect(fileB).not.toContain('COMPRA EXCLUSIVA A');
        expect(fileB).not.toContain('Conta Exclusiva da A');
        expect(fileA).not.toContain('SALARIO');
        expect(fileB).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
        expect(fileB).not.toContain(companyB.company.id);
    });

    it('neutraliza fórmula na descrição e no nome da conta', async () => {
        const owner: Account = await harness.signUp('formula');
        const account = await harness.inCompany(owner.company.id, async () =>
            accounts.createFileAccount({ kind: 'checking', name: '=CONTA()', currency: 'BRL', institutionName: '@banco' })
        );
        await harness.inCompany(owner.company.id, async () =>
            ingestion.ingest({
                accountId: account.id,
                source: 'ofx',
                items: [
                    {
                        externalId: 'f-1',
                        date: `${CLOSED_MONTH}-10`,
                        amountMinor: -500,
                        currency: 'BRL',
                        description: '=HYPERLINK("http://x")',
                        counterpartyName: '+cmd'
                    }
                ]
            })
        );

        const csv: string = (await download(owner, `format=csv&month=${CLOSED_MONTH}`)).bytes.toString('utf8');
        const sheet: Worksheet = await sheetOf(await download(owner, `format=xlsx&month=${CLOSED_MONTH}`));

        expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
        expect(csv).toContain(";'+cmd;");
        expect(csv).toContain(";'=CONTA();'@banco;");
        expect(sheet.getCell('B2').value).toBe(`'=HYPERLINK("http://x")`);
        expect(sheet.getCell('H2').value).toBe("'=CONTA()");
        expect(sheet.getCell('I2').value).toBe("'@banco");
    });

    it('devolve só o cabeçalho quando o filtro não pega nada', async () => {
        const owner: Account = await harness.signUp('empty');

        const csv: RawResponse = await download(owner, 'format=csv');
        const xlsx: RawResponse = await download(owner, 'format=xlsx');

        expect(linesOf(csv)).toHaveLength(1);
        expect((await sheetOf(xlsx)).rowCount).toBe(1);
    });

    it('recusa mais de 50.000 linhas com 422 e meta.rows, e aceita exatamente 50.000', async () => {
        const owner: Account = await harness.signUp('too-large');
        const account = await harness.inCompany(owner.company.id, async () =>
            accounts.createFileAccount({ kind: 'checking', name: 'Conta Cheia', currency: 'BRL' })
        );
        const insert = async (from: number, to: number): Promise<void> => {
            await harness.pg.query(
                `INSERT INTO "Transactions"
                   ("id", "companyId", "accountId", "externalId", "date", "amountMinor", "currency", "description",
                    "normalizedDescription", "categorySource", "source")
                 SELECT gen_random_uuid(), $1, $2, 'bulk-' || n, DATE '2026-05-01' + (n % 28), -100, 'BRL', 'COMPRA ' || n,
                        'COMPRA ' || n, 'none', 'ofx'
                   FROM generate_series($3::int, $4::int) AS n`,
                [owner.company.id, account.id, from, to]
            );
        };
        await insert(1, MAX_ROWS + 1);

        const refused: RawResponse = await download(owner, 'format=csv&from=2026-05-01&to=2026-05-31');
        await harness.pg.query(`DELETE FROM "Transactions" WHERE "companyId" = $1 AND "externalId" = $2`, [
            owner.company.id,
            `bulk-${String(MAX_ROWS + 1)}`
        ]);
        const accepted: RawResponse = await download(owner, 'format=csv&from=2026-05-01&to=2026-05-31');

        expect(refused.status).toBe(422);
        const problem: ProblemBody = JSON.parse(refused.bytes.toString('utf8')) as ProblemBody;
        expect(problem.type).toBe('transactions.export_too_large');
        expect(problem.meta?.rows).toBe(MAX_ROWS + 1);
        expect(accepted.status).toBe(200);
        const acceptedLines: string[] = linesOf(accepted);
        expect(acceptedLines).toHaveLength(MAX_ROWS + 1);
        const days: string[] = acceptedLines.slice(1).map((line: string) => (line.split(';')[0] as string).split('/').reverse().join('-'));
        expect(days).toEqual([...days].sort());
    }, 120_000);

    it('rejeita formato inválido, intervalo acima de 400 dias e sem sessão', async () => {
        const owner: Account = await harness.signUp('invalid');

        expect((await download(owner, 'format=pdf')).status).toBe(400);
        expect((await harness.callRaw(owner.token, EXPORT_PATH)).status).toBe(400);
        expect((await download(owner, 'format=csv&from=2025-01-01&to=2026-09-01')).status).toBe(400);
        expect((await download(owner, `format=csv&month=${CLOSED_MONTH}&from=2026-09-01&to=2026-09-02`)).status).toBe(400);
        expect((await harness.callRaw(null, `${EXPORT_PATH}?format=csv`)).status).toBe(401);
    });

    it('limita a 10 exportações por minuto por company: a 11ª recebe 429', async () => {
        const owner: Account = await harness.signUp('limits');
        const other: Account = await harness.signUp('limits-other');

        const statuses: number[] = [];
        for (let call: number = 0; call < EXPORTS_PER_MINUTE; call++) {
            statuses.push((await download(owner, 'format=csv')).status);
        }

        expect(statuses).toEqual(Array<number>(EXPORTS_PER_MINUTE).fill(200));
        expect((await download(owner, 'format=csv')).status).toBe(429);
        expect((await download(other, 'format=csv')).status).toBe(200);
    });

    it('envia os cabeçalhos de download com nome, data da company e sem cache', async () => {
        const owner: Account = await harness.signUp('headers');

        const csv: RawResponse = await download(owner, 'format=csv');
        const xlsx: RawResponse = await download(owner, 'format=xlsx');

        expect(csv.headers.get('content-disposition')).toBe(`attachment; filename="vera-transacoes-${TODAY}.csv"`);
        expect(csv.headers.get('content-type')).toBe('text/csv; charset=utf-8');
        expect(csv.headers.get('cache-control')).toBe('no-store');
        expect(xlsx.headers.get('content-disposition')).toBe(`attachment; filename="vera-transacoes-${TODAY}.xlsx"`);
        expect(xlsx.headers.get('content-type')).toBe(XLSX_TYPE);
        expect(xlsx.headers.get('cache-control')).toBe('no-store');
    });
});
