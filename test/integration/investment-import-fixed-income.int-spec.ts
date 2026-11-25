import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AddressInfo, Server } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LogService } from '../../src/core/observability/log.service';
import { seriesUntil } from '../support/reference-curve-series';
import { Account, AllocationHarness } from './support/allocation-harness';

process.env['FIXED_INCOME_INDEX_DRIVER'] = 'mock';

interface Reply<T = Record<string, unknown>> {
    readonly status: number;
    readonly body: T;
}

interface FixedIncomeBody {
    readonly lineId: string;
    readonly product: string;
    readonly kind: string | null;
    readonly indexer: string | null;
    readonly rateBps: number | null;
    readonly appliedMinor: number | null;
    readonly status: string;
    readonly reason: string | null;
    readonly suggestion: string;
}

interface PreviewBody {
    readonly previewId: string;
    readonly operations: unknown[];
    readonly fixedIncome: FixedIncomeBody[];
}

interface CommitBody {
    readonly importId: string;
    readonly fixedIncome: { readonly lineId: string; readonly titleId: string }[];
}

interface ProblemBody {
    readonly type: string;
    readonly meta?: Record<string, unknown>;
}

interface TitleRow {
    readonly id: string;
    readonly indexer: string;
    readonly rateBps: number;
    readonly appliedMinor: string;
    readonly importId: string | null;
    readonly deletedAt: Date | null;
}

const POSITION_DATE: string = '2026-10-30';
const FIXTURE: Buffer = readFileSync(join(__dirname, '../fixtures/investment-import/generated/b3/b3-posicao-renda-fixa.csv'));

describe('investment import: renda fixa da Posição', () => {
    let harness: AllocationHarness;
    let origin: string;
    const logged: string[] = [];

    beforeAll(async () => {
        harness = await AllocationHarness.start('investment_import_fixed_income');
        const address: AddressInfo = (harness.app.getHttpServer() as Server).address() as AddressInfo;
        origin = `http://127.0.0.1:${String(address.port)}`;
        const series = seriesUntil('2026-10-29', '2026-09');
        await harness.pg.query(
            `INSERT INTO "IndexSeriesPoints" ("series","date","value","source")
             SELECT 'cdi_daily', d, v, 'test' FROM unnest($1::date[], $2::numeric[]) AS t(d, v)`,
            [series.cdi.dates, series.cdi.rates.map((rate) => rate.toFixed(8))]
        );
        await harness.pg.query(
            `INSERT INTO "IndexSeriesPoints" ("series","date","value","source")
             SELECT 'ipca_monthly', (m || '-01')::date, v, 'test' FROM unnest($1::text[], $2::numeric[]) AS t(m, v)`,
            [series.ipca.months, series.ipca.values.map((value) => value.toFixed(8))]
        );
        const logs: LogService = harness.app.get(LogService, { strict: false });
        for (const level of ['info', 'warn', 'error', 'debug'] as const) {
            const original = logs[level].bind(logs);
            vi.spyOn(logs, level).mockImplementation((entry) => {
                logged.push(JSON.stringify(entry));
                original(entry);
            });
        }
    });

    afterAll(async () => {
        await harness.stop();
    });

    async function preview(account: Account, file: Buffer = FIXTURE, name: string = 'posicao.csv'): Promise<PreviewBody> {
        const form: FormData = new FormData();
        form.append('positionDate', POSITION_DATE);
        form.append('file', new Blob([new Uint8Array(file)]), name);
        const response: Response = await fetch(`${origin}/investment-imports/preview`, {
            method: 'POST',
            body: form,
            headers: { authorization: `Bearer ${account.token}` }
        });
        expect(response.status).toBe(200);
        return (await response.json()) as PreviewBody;
    }

    async function commit<T = CommitBody>(account: Account, previewId: string, fixedIncome: unknown[]): Promise<Reply<T>> {
        return harness.call<T>(account.token, 'POST', '/investment-imports', { previewId, edits: [], fixedIncome });
    }

    async function titlesOf(account: Account): Promise<TitleRow[]> {
        const result = await harness.pg.query<TitleRow>(
            `SELECT "id","indexer","rateBps","appliedMinor","importId","deletedAt" FROM "FixedIncomeTitles" WHERE "companyId" = $1 ORDER BY "rateBps"`,
            [account.company.id]
        );
        return result.rows;
    }

    function lineOf(body: PreviewBody, fragment: string): FixedIncomeBody {
        const found: FixedIncomeBody | undefined = body.fixedIncome.find((line: FixedIncomeBody): boolean =>
            line.product.includes(fragment)
        );
        if (found === undefined) {
            throw new Error(`missing ${fragment}`);
        }
        return found;
    }

    it('a prévia propõe os títulos sem gravar nada', async () => {
        const owner: Account = await harness.signUp('rf-previa');

        const ready: PreviewBody = await preview(owner);

        expect(ready.fixedIncome.map((line: FixedIncomeBody): string => line.status)).toEqual([
            'check',
            'check',
            'check',
            'check',
            'check',
            'check',
            'needs_input',
            'needs_input'
        ]);
        expect(lineOf(ready, '112% CDI')).toMatchObject({
            kind: 'cdb',
            indexer: 'cdi_percent',
            rateBps: 11200,
            appliedMinor: 1000000,
            reason: 'assumed_face_price'
        });
        expect(lineOf(ready, '112% CDI').suggestion).toContain('Achamos: CDB BANCO EXEMPLO, 112% do CDI, vence em 03/2028. Confirmar?');
        expect(lineOf(ready, 'CARENCIA')).toMatchObject({ status: 'check', reason: 'grace_period' });
        expect(await titlesOf(owner)).toEqual([]);
    });

    it('confirmar cria o título certo, corrigir grava a correção e desfazer remove', async () => {
        const owner: Account = await harness.signUp('rf-commit');
        const ready: PreviewBody = await preview(owner);
        const cdi: FixedIncomeBody = lineOf(ready, '112% CDI');
        const pre: FixedIncomeBody = lineOf(ready, 'PRE');
        const noIndexer: FixedIncomeBody = lineOf(ready, 'SEM INDEXADOR');

        const done: Reply<CommitBody> = await commit(owner, ready.previewId, [
            { lineId: cdi.lineId, confirm: true },
            { lineId: pre.lineId, edits: { rateBps: 1250 } },
            { lineId: noIndexer.lineId, edits: { indexer: 'prefixed', rateBps: 1100 } },
            { lineId: lineOf(ready, 'IPCA').lineId, skip: true }
        ]);

        expect(done.status).toBe(201);
        expect(done.body.fixedIncome.map((item) => item.lineId)).toEqual([cdi.lineId, pre.lineId, noIndexer.lineId]);
        const created: TitleRow[] = await titlesOf(owner);
        expect(created.map((title: TitleRow): [string, number] => [title.indexer, title.rateBps])).toEqual([
            ['prefixed', 1100],
            ['prefixed', 1250],
            ['cdi_percent', 11200]
        ]);
        expect(created.every((title: TitleRow): boolean => title.importId === done.body.importId)).toBe(true);
        expect(created.find((title: TitleRow): boolean => title.rateBps === 11200)?.appliedMinor).toBe('1000000');

        const undone = await harness.call(owner.token, 'DELETE', `/investment-imports/${done.body.importId}`);

        expect(undone.status).toBe(200);
        expect((await titlesOf(owner)).every((title: TitleRow): boolean => title.deletedAt !== null)).toBe(true);
    });

    it('recusa o título que precisa de dados sem os campos e mantém a prévia válida', async () => {
        const owner: Account = await harness.signUp('rf-incompleto');
        const ready: PreviewBody = await preview(owner);
        const noCurve: FixedIncomeBody = lineOf(ready, 'SEM CURVA');

        const refused: Reply<ProblemBody> = await commit<ProblemBody>(owner, ready.previewId, [{ lineId: noCurve.lineId, confirm: true }]);

        expect(refused.status).toBe(422);
        expect(refused.body.type).toBe('import.fixed_income_incomplete');
        expect(refused.body.meta).toMatchObject({ lineId: noCurve.lineId, missing: ['rateBps'] });
        const unknown: Reply<ProblemBody> = await commit<ProblemBody>(owner, ready.previewId, [{ lineId: 'F99', skip: true }]);
        expect(unknown.body.type).toBe('import.invalid_edit');
        const completed: Reply<CommitBody> = await commit(owner, ready.previewId, [{ lineId: noCurve.lineId, edits: { rateBps: 10800 } }]);
        expect(completed.status).toBe(201);
        expect(await titlesOf(owner)).toHaveLength(1);
    });

    it('juros, amortização e aplicação em outra data só aparecem quando a Movimentação vem no mesmo arquivo', async () => {
        const owner: Account = await harness.signUp('rf-movimentacao');
        const workbook: ExcelJS.Workbook = new ExcelJS.Workbook();
        for (const [name, file] of [
            ['Renda Fixa', 'b3-posicao-renda-fixa.csv'],
            ['Movimentação', 'b3-movimentacao.csv']
        ] as const) {
            const sheet: ExcelJS.Worksheet = workbook.addWorksheet(name);
            const text: string = readFileSync(join(__dirname, '../fixtures/investment-import/generated/b3', file), 'utf8');
            text.split('\n')
                .filter((row: string): boolean => row.trim() !== '')
                .forEach((row: string): void => {
                    sheet.addRow(row.split(';'));
                });
        }

        const ready: PreviewBody = await preview(owner, Buffer.from(await workbook.xlsx.writeBuffer()), 'posicao.xlsx');

        expect(lineOf(ready, 'DEBENTURE')).toMatchObject({ status: 'needs_input', reason: 'payment_event', rateBps: null });
        expect(lineOf(ready, 'APLICACAO TARDIA')).toMatchObject({ status: 'check', reason: 'application_date_differs', rateBps: 10500 });
    });

    it('a decisão precisa de exatamente uma ação', async () => {
        const owner: Account = await harness.signUp('rf-acao');
        const ready: PreviewBody = await preview(owner);

        const both = await commit<ProblemBody>(owner, ready.previewId, [{ lineId: 'F1', confirm: true, skip: true }]);
        const none = await commit<ProblemBody>(owner, ready.previewId, [{ lineId: 'F1' }]);

        expect([both.status, none.status]).toEqual([400, 400]);
    });

    it('título igual já cadastrado vem duplicado e a confirmação não cria outro', async () => {
        const owner: Account = await harness.signUp('rf-duplicado');
        const first: PreviewBody = await preview(owner);
        await commit(owner, first.previewId, [{ lineId: lineOf(first, '112% CDI').lineId, confirm: true }]);

        const again: PreviewBody = await preview(owner);

        expect(lineOf(again, '112% CDI')).toMatchObject({ status: 'duplicate', reason: 'duplicate' });
        const refused: Reply<ProblemBody> = await commit<ProblemBody>(owner, again.previewId, [
            { lineId: lineOf(again, '112% CDI').lineId, confirm: true }
        ]);
        expect(refused.body.type).toBe('import.fixed_income_duplicate');
        const stale: PreviewBody = await preview(owner, FIXTURE.subarray(0, FIXTURE.length));
        const lineId: string = lineOf(stale, 'PRE').lineId;
        await commit(owner, (await preview(owner)).previewId, [{ lineId, confirm: true }]);
        const late: Reply<ProblemBody> = await commit<ProblemBody>(owner, stale.previewId, [{ lineId, confirm: true }]);
        expect(late.body.type).toBe('import.fixed_income_duplicate');
        const done: Reply<CommitBody> = await commit(owner, again.previewId, [{ lineId: lineOf(again, '112% CDI').lineId, skip: true }]);
        expect(done.body.fixedIncome).toEqual([]);
        expect(await titlesOf(owner)).toHaveLength(2);
    });

    it('sem preço de emissão na planilha a prévia assume a face e marca check', async () => {
        const owner: Account = await harness.signUp('rf-face');

        const ready: PreviewBody = await preview(owner);

        expect(lineOf(ready, '112% CDI')).toMatchObject({ status: 'check', reason: 'assumed_face_price' });
    });

    it('duas companies ficam isoladas e nada sensível vai para o log', async () => {
        const first: Account = await harness.signUp('rf-iso-a');
        const second: Account = await harness.signUp('rf-iso-b');
        logged.length = 0;
        const ready: PreviewBody = await preview(first);
        await commit(first, ready.previewId, [{ lineId: lineOf(ready, '112% CDI').lineId, confirm: true }]);

        const other: PreviewBody = await preview(second);

        expect(lineOf(other, '112% CDI').status).toBe('check');
        expect((await commit<ProblemBody>(second, ready.previewId, [])).body.type).toBe('preview.expired');
        expect(await titlesOf(second)).toEqual([]);
        const inLogs: string = logged.join('\n');
        for (const secret of ['BANCO EXEMPLO', '11200', '1000000', 'CDB EXEMPLO']) {
            expect(inLogs).not.toContain(secret);
        }
    });
});
