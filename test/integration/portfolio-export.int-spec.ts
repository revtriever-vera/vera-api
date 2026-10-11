import { Row, Workbook, Worksheet } from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IndexSyncApplication } from '../../src/modules/fixed-income/application/index-sync.application';
import { addDays } from '../../src/modules/fixed-income/domain/curve/business-days';
import { AuthTokens, SessionIssuerPort } from '../../src/modules/identity/ports/session-issuer.port';
import { DateUtil } from '../../src/shared/utils/date.util';
import { Account, AllocationHarness, RawResponse } from './support/allocation-harness';
import { addPrototypePositions, seedPrototypeAssets, seedUsdRate } from './support/portfolio-seed';
import { CapturingPublisher } from './support/queue';

process.env['FIXED_INCOME_INDEX_DRIVER'] = 'mock';

const TODAY: string = DateUtil.todayInBrazil();
const BOM: string = '﻿';
const EXPORT_PATH: string = '/portfolio/export';
const XLSX_TYPE: string = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const EXPORTS_PER_MINUTE: number = 10;

describe('portfolio export', () => {
    let harness: AllocationHarness;
    let assetIds: Record<string, string>;

    beforeAll(async () => {
        harness = await AllocationHarness.start('portfolio_export', new CapturingPublisher());
        const sync: IndexSyncApplication = harness.app.get(IndexSyncApplication, { strict: false });
        const from: string = addDays(TODAY, -800);
        await sync.syncWindow({ series: 'cdi_daily', from, to: TODAY });
        await sync.syncWindow({ series: 'ipca_monthly', from, to: TODAY });
        assetIds = await seedPrototypeAssets(harness);
        await seedUsdRate(harness);
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function createTitle(account: Account, name: string): Promise<void> {
        const response = await harness.call(account.token, 'POST', '/fixed-income/titles', {
            kind: 'cdb',
            name,
            indexer: 'cdi_percent',
            rateBps: 11000,
            appliedMinor: 10_000_000,
            appliedAt: addDays(TODAY, -540),
            maturityDate: addDays(TODAY, 900)
        });
        expect(response.status).toBe(201);
    }

    async function prototypeAccount(label: string): Promise<Account> {
        const account: Account = await harness.signUp(label);
        await addPrototypePositions(harness, account, assetIds);
        await createTitle(account, 'CDB Banco');
        await createTitle(account, 'LCI Banco');
        await createTitle(account, '=1+1');
        return account;
    }

    async function download(account: Account, format: string): Promise<RawResponse> {
        return harness.callRaw(account.token, `${EXPORT_PATH}?format=${format}`);
    }

    async function englishToken(account: Account): Promise<string> {
        await harness.pg.query(`UPDATE "Users" SET "locale" = 'en' WHERE "id" = $1`, [account.user.id]);
        const issuer: SessionIssuerPort = harness.app.get(SessionIssuerPort, { strict: false });
        const tokens: AuthTokens = await harness.inCompany(account.company.id, async () =>
            issuer.issueForNewLogin({ ...account.user, locale: 'en' }, { ip: '203.0.113.7', userAgent: 'int-test' }, 'google')
        );
        return tokens.accessToken;
    }

    function linesOf(response: RawResponse): string[] {
        return response.bytes
            .toString('utf8')
            .split('\r\n')
            .filter((line: string) => line.length > 0);
    }

    async function sheetOf(response: RawResponse): Promise<Worksheet> {
        const workbook: Workbook = new Workbook();
        await workbook.xlsx.load(response.bytes as unknown as Parameters<Workbook['xlsx']['load']>[0]);
        return workbook.worksheets[0] as Worksheet;
    }

    it('exporta o csv da carteira do protótipo em pt-BR, com BOM, cabeçalho e uma linha por holding', async () => {
        const account: Account = await prototypeAccount('csv-ptbr');

        const response: RawResponse = await download(account, 'csv');

        expect(response.status).toBe(200);
        const text: string = response.bytes.toString('utf8');
        expect(text.startsWith(BOM)).toBe(true);
        const lines: string[] = linesOf(response);
        expect(lines[0]).toBe(`${BOM}Ativo;Nome;Classe;Quantidade;Valor (BRL);Fonte do valor`);
        expect(lines).toHaveLength(20);
        expect(lines).toContain('ITUB4;ITUB4;Ações Brasil;2000;75600,00;B3 via brapi');
        expect(lines.some((line: string) => line.startsWith('BTC;') && line.includes(';0,45;') && line.endsWith('CoinGecko'))).toBe(true);
        expect(
            lines.some((line: string) => line.startsWith('TESOURO-SELIC-2029;') && line.endsWith(';3,2;51840,00;Preço oficial do Tesouro'))
        ).toBe(true);
        const cdb: string = lines.find((line: string) => line.startsWith('CDB Banco;')) as string;
        expect(cdb.split(';')[3]).toBe('');
        expect(cdb.endsWith('Curva do CDI (BC)')).toBe(true);
    });

    it('bate com a lista de holdings: mesma ordem e mesmos valores, sem id interno', async () => {
        const account: Account = await prototypeAccount('csv-match');
        const holdings = await harness.call<{ data: { symbol: string; valueMinor: number }[] }>(
            account.token,
            'GET',
            '/portfolio/holdings'
        );

        const lines: string[] = linesOf(await download(account, 'csv')).slice(1);

        expect(lines.map((line: string) => line.split(';')[0])).toEqual(holdings.body.data.map((item) => item.symbol.replace(/^=/, "'=")));
        expect(lines.map((line: string) => Math.round(Number((line.split(';')[4] as string).replace(',', '.')) * 100))).toEqual(
            holdings.body.data.map((item) => item.valueMinor)
        );
        const everything: string = lines.join('\n');
        expect(everything).not.toContain(account.company.id);
        holdings.body.data.forEach((item) => {
            expect(everything).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
            expect(item.symbol.length).toBeGreaterThan(0);
        });
    });

    it('exporta o xlsx com células numéricas, formato de moeda e texto neutralizado', async () => {
        const account: Account = await prototypeAccount('xlsx');

        const response: RawResponse = await download(account, 'xlsx');

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe(XLSX_TYPE);
        const sheet: Worksheet = await sheetOf(response);
        expect(sheet.name).toBe('Carteira');
        expect(sheet.rowCount).toBe(20);
        expect(sheet.getRow(1).values).toEqual([undefined, 'Ativo', 'Nome', 'Classe', 'Quantidade', 'Valor (BRL)', 'Fonte do valor']);
        const rows: Row[] = sheet.getRows(2, 19) ?? [];
        const itub = rows.find((row: Row) => row.getCell(1).value === 'ITUB4');
        expect(itub?.getCell(4).value).toBe(2000);
        expect(itub?.getCell(5).value).toBe(75_600);
        expect(itub?.getCell(5).numFmt).toBe('"R$" #,##0.00');
        expect(itub?.getCell(6).value).toBe('B3 via brapi');
        const btc = rows.find((row: Row) => row.getCell(1).value === 'BTC');
        expect(btc?.getCell(4).value).toBe(0.45);
        const formula = rows.find((row: Row) => row.getCell(2).value === "'=1+1");
        expect(formula?.getCell(1).value).toBe("'=1+1");
        expect(formula?.getCell(4).value).toBeNull();
        expect(typeof formula?.getCell(5).value).toBe('number');
    });

    it('devolve só o cabeçalho para uma carteira vazia', async () => {
        const account: Account = await harness.signUp('empty');

        const csv: RawResponse = await download(account, 'csv');
        const xlsx: RawResponse = await download(account, 'xlsx');

        expect(csv.status).toBe(200);
        expect(linesOf(csv)).toEqual([`${BOM}Ativo;Nome;Classe;Quantidade;Valor (BRL);Fonte do valor`]);
        expect(xlsx.status).toBe(200);
        expect((await sheetOf(xlsx)).rowCount).toBe(1);
    });

    it('usa cabeçalhos em inglês e decimal com ponto quando o idioma da pessoa é en', async () => {
        const account: Account = await prototypeAccount('english');
        const token: string = await englishToken(account);

        const response: RawResponse = await harness.callRaw(token, `${EXPORT_PATH}?format=csv`);

        const lines: string[] = linesOf(response);
        expect(lines[0]).toBe(`${BOM}Asset,Name,Class,Quantity,Value (BRL),Value source`);
        expect(lines).toContain('ITUB4,ITUB4,Brazilian stocks,2000,75600.00,B3 via brapi');
        expect(lines.some((line: string) => line.startsWith('BTC,') && line.includes(',0.45,'))).toBe(true);
    });

    it('isola as companies: o arquivo da B não tem nenhuma linha da A', async () => {
        const companyA: Account = await harness.signUp('isolation-a');
        const companyB: Account = await harness.signUp('isolation-b');
        await createTitle(companyA, 'CDB Exclusivo da A');
        await addPrototypePositions(harness, companyB, assetIds, ['PETR4', 'ITUB4']);

        const fileA: string = (await download(companyA, 'csv')).bytes.toString('utf8');
        const fileB: string = (await download(companyB, 'csv')).bytes.toString('utf8');

        expect(fileA).toContain('CDB Exclusivo da A');
        expect(fileB).not.toContain('CDB Exclusivo da A');
        expect(fileB).toContain('WEGE3');
        expect(fileA).not.toContain('WEGE3');
    });

    it('rejeita formato inválido ou ausente com 400 e sem sessão com 401', async () => {
        const account: Account = await harness.signUp('invalid');

        expect((await download(account, 'pdf')).status).toBe(400);
        expect((await harness.callRaw(account.token, EXPORT_PATH)).status).toBe(400);
        expect((await harness.callRaw(null, `${EXPORT_PATH}?format=csv`)).status).toBe(401);
    });

    it('limita a 10 exportações por minuto por company: a 11ª recebe 429', async () => {
        const account: Account = await harness.signUp('limits');
        const other: Account = await harness.signUp('limits-other');

        const statuses: number[] = [];
        for (let call: number = 0; call < EXPORTS_PER_MINUTE; call++) {
            statuses.push((await download(account, 'csv')).status);
        }

        expect(statuses).toEqual(Array<number>(EXPORTS_PER_MINUTE).fill(200));
        expect((await download(account, 'csv')).status).toBe(429);
        expect((await download(other, 'csv')).status).toBe(200);
    });

    it('envia os cabeçalhos de download com nome, data da company e sem cache', async () => {
        const account: Account = await harness.signUp('headers');

        const csv: RawResponse = await download(account, 'csv');
        const xlsx: RawResponse = await download(account, 'xlsx');

        expect(csv.headers.get('content-disposition')).toBe(`attachment; filename="vera-carteira-${TODAY}.csv"`);
        expect(csv.headers.get('content-type')).toBe('text/csv; charset=utf-8');
        expect(csv.headers.get('cache-control')).toBe('no-store');
        expect(xlsx.headers.get('content-disposition')).toBe(`attachment; filename="vera-carteira-${TODAY}.xlsx"`);
        expect(xlsx.headers.get('content-type')).toBe(XLSX_TYPE);
        expect(xlsx.headers.get('cache-control')).toBe('no-store');
    });
});
