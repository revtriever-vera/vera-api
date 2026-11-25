import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AddressInfo, Server } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MockLlmDriver } from '../../src/core/llm/drivers/mock-llm.driver';
import { LogService } from '../../src/core/observability/log.service';
import { Account, AllocationHarness } from './support/allocation-harness';

interface LineBody {
    readonly lineId: string;
    readonly status: string;
    readonly reason: string | null;
    readonly kind: string | null;
    readonly ticker: string | null;
    readonly currency: string | null;
    readonly fxRate: string | null;
    readonly grossBrlMinor: number | null;
    readonly withheldTaxMinor: number | null;
}

interface PreviewBody {
    readonly previewId: string;
    readonly source: string;
    readonly documentType: string;
    readonly operations: LineBody[];
    readonly notes: { readonly code: string; readonly count: number }[];
    readonly warnings: { readonly code: string; readonly count: number }[];
    readonly alreadyImportedAt: string | null;
}

interface CommitBody {
    readonly applied: number;
}

const AVENUE: string = join(__dirname, '..', 'fixtures', 'investment-import', 'generated', 'avenue');
const RATES: readonly [string, string][] = [
    ['2026-07-08', '5.40'],
    ['2026-07-14', '5.50'],
    ['2026-08-05', '5.00'],
    ['2026-08-12', '5.00'],
    ['2026-08-14', '5.10'],
    ['2026-08-25', '5.00'],
    ['2026-09-01', '5.20']
];

describe('investment import of a monthly Avenue statement', () => {
    let harness: AllocationHarness;
    let mock: MockLlmDriver;
    let origin: string;
    const logged: string[] = [];

    beforeAll(async () => {
        harness = await AllocationHarness.start('investment_import_avenue');
        mock = harness.app.get(MockLlmDriver, { strict: false });
        const address: AddressInfo = (harness.app.getHttpServer() as Server).address() as AddressInfo;
        origin = `http://127.0.0.1:${String(address.port)}`;
        for (const symbol of ['AAPL', 'MSFT', 'KO']) {
            await harness.pg.query(
                `INSERT INTO "Assets" ("id","market","externalId","symbol","name","kind","typeGroup","suggestedClassKey","currency","quotesProvider","quantityDecimals")
                 VALUES ($1,'US',$2,$2,$2,'stock','acoes_eua','acoes_eua','USD','us_equities',6)`,
                [crypto.randomUUID(), symbol]
            );
        }
        for (const [date, rate] of RATES) {
            await harness.pg.query(
                `INSERT INTO "ExchangeRates" ("id","currency","date","brlPerUnit","source") VALUES ($1,'USD',$2,$3,'bcb-ptax')`,
                [crypto.randomUUID(), date, rate]
            );
        }
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

    function answerOf(month: string, change: (answer: Record<string, unknown>) => void = (): void => undefined): string {
        const answer: Record<string, unknown> = JSON.parse(readFileSync(join(AVENUE, `avenue-${month}.expected.json`), 'utf8')) as Record<
            string,
            unknown
        >;
        change(answer);
        return JSON.stringify(answer);
    }

    async function preview(account: Account, file: string, answer: string): Promise<PreviewBody> {
        mock.enqueue(answer);
        const form: FormData = new FormData();
        form.append('modelConsent', 'true');
        form.append('file', new Blob([new Uint8Array(readFileSync(join(AVENUE, file)))]), file);
        const response: Response = await fetch(`${origin}/investment-imports/preview`, {
            method: 'POST',
            body: form,
            headers: { authorization: `Bearer ${account.token}` }
        });
        const body: unknown = await response.json();
        expect(response.status, JSON.stringify(body)).toBe(200);
        return body as PreviewBody;
    }

    function lineOf(body: PreviewBody, ticker: string, kind: string): LineBody {
        const found: LineBody | undefined = body.operations.find((line: LineBody): boolean => line.ticker === ticker && line.kind === kind);
        if (found === undefined) {
            throw new Error(`missing ${ticker} ${kind}`);
        }
        return found;
    }

    async function positionOf(account: Account, symbol: string): Promise<{ quantity: string; averagePrice: string | null } | undefined> {
        const result = await harness.pg.query<{ quantity: string; averagePrice: string | null }>(
            `SELECT p."quantity", p."averagePrice" FROM "Positions" p JOIN "Assets" a ON a."id" = p."assetId"
             WHERE p."companyId" = $1 AND a."symbol" = $2 AND p."deletedAt" IS NULL`,
            [account.company.id, symbol]
        );
        return result.rows[0];
    }

    async function commit(account: Account, body: PreviewBody, mode: 'add' | null): Promise<number> {
        const edits: unknown[] =
            mode === null
                ? []
                : body.operations
                      .filter((line: LineBody): boolean => line.reason === 'position_mode_required')
                      .map((line: LineBody): unknown => ({ lineId: line.lineId, positionMode: mode }));
        const done = await harness.call<CommitBody>(account.token, 'POST', '/investment-imports', { previewId: body.previewId, edits });
        expect(done.status, JSON.stringify(done.body)).toBe(201);
        return done.body.applied;
    }

    it('reads three months in order: dollar lines with the PTAX of the day, withheld tax apart, average price from the history', async () => {
        const owner: Account = await harness.signUp('avenue');

        const july: PreviewBody = await preview(owner, 'avenue-2026-07.pdf', answerOf('2026-07'));

        expect(july.source).toBe('model');
        expect(july.documentType).toBe('foreign_statement');
        expect(lineOf(july, 'AAPL', 'buy')).toMatchObject({ status: 'ok', currency: 'USD', fxRate: '5.4', grossBrlMinor: 1026000 });
        expect(lineOf(july, 'MSFT', 'buy')).toMatchObject({ status: 'ok', fxRate: '5.5' });
        expect(july.operations.filter((line: LineBody): boolean => line.status === 'ignored')).toHaveLength(2);
        expect(july.notes).toContainEqual({ code: 'foreign_rate_fallback', count: 1 });
        expect(await commit(owner, july, null)).toBe(2);
        expect(await positionOf(owner, 'AAPL')).toMatchObject({ quantity: '10.0000000000', averagePrice: '190.00000000' });

        const august: PreviewBody = await preview(owner, 'avenue-2026-08.pdf', answerOf('2026-08'));
        expect(lineOf(august, 'AAPL', 'income')).toMatchObject({ currency: 'USD', withheldTaxMinor: 72, grossBrlMinor: 1224 });
        await commit(owner, august, 'add');
        const apple = await positionOf(owner, 'AAPL');
        expect(Number(apple?.quantity)).toBe(15);
        expect(Number(apple?.averagePrice)).toBeCloseTo(193.33333333, 6);
        expect(Number(apple?.averagePrice)).not.toBe(190);
    });

    it('the same month again is already imported, by the file and by the lines of another file of the same period', async () => {
        const owner: Account = await harness.signUp('avenue-duplicado');
        const first: PreviewBody = await preview(owner, 'avenue-2026-07.pdf', answerOf('2026-07'));
        await commit(owner, first, null);

        const again: PreviewBody = await preview(owner, 'avenue-2026-07.pdf', answerOf('2026-07'));
        const scanned: PreviewBody = await preview(owner, 'avenue-2026-07-escaneado.pdf', answerOf('2026-07'));

        expect(again.alreadyImportedAt).not.toBeNull();
        expect(lineOf(again, 'AAPL', 'buy').status).toBe('duplicate');
        expect(lineOf(scanned, 'AAPL', 'buy').status).toBe('duplicate');
        expect(lineOf(scanned, 'MSFT', 'buy').status).toBe('duplicate');
    });

    function summaryOnlyAnswer(): string {
        return answerOf('2026-09', (answer: Record<string, unknown>): void => {
            answer['operations'] = [];
            answer['taxWithholdings'] = [];
            answer['cashMovements'] = [];
        });
    }

    it('creates the positions of a summary with no trade in the month as check lines with the summary price as assumed cost', async () => {
        const owner: Account = await harness.signUp('avenue-resumo');

        const summary: PreviewBody = await preview(owner, 'avenue-2026-09.pdf', summaryOnlyAnswer());

        expect(summary.notes).not.toContainEqual(expect.objectContaining({ code: 'foreign_position_not_applied' }));
        for (const ticker of ['AAPL', 'MSFT', 'KO']) {
            expect(lineOf(summary, ticker, 'buy')).toMatchObject({
                status: 'check',
                reason: 'assumed_cost',
                currency: 'USD',
                fxRate: '5.2'
            });
        }
        expect(await commit(owner, summary, null)).toBe(3);
        expect(await positionOf(owner, 'MSFT')).toMatchObject({ quantity: '3.0000000000', averagePrice: '433.00000000' });
        expect(await positionOf(owner, 'KO')).toMatchObject({ quantity: '8.0000000000', averagePrice: '63.00000000' });
    });

    it('leaves alone a summary row of an asset that already has a position', async () => {
        const owner: Account = await harness.signUp('avenue-resumo-existente');
        await commit(owner, await preview(owner, 'avenue-2026-07.pdf', answerOf('2026-07')), null);

        const summary: PreviewBody = await preview(owner, 'avenue-2026-09.pdf', summaryOnlyAnswer());

        expect(lineOf(summary, 'AAPL', 'buy')).toMatchObject({ status: 'ignored', reason: 'skipped' });
        expect(lineOf(summary, 'MSFT', 'buy').status).toBe('ignored');
        expect(lineOf(summary, 'KO', 'buy').reason).toBe('assumed_cost');
        expect(await commit(owner, summary, null)).toBe(1);
        expect(await positionOf(owner, 'AAPL')).toMatchObject({ quantity: '10.0000000000', averagePrice: '190.00000000' });
    });

    it('warns about a trade that comes before the ones already recorded for the asset', async () => {
        const owner: Account = await harness.signUp('avenue-ordem');
        await commit(owner, await preview(owner, 'avenue-2026-07.pdf', answerOf('2026-07')), null);
        await commit(owner, await preview(owner, 'avenue-2026-08.pdf', answerOf('2026-08')), 'add');

        const earlier: PreviewBody = await preview(
            owner,
            'avenue-2026-07-escaneado.pdf',
            answerOf('2026-07', (answer: Record<string, unknown>): void => {
                const first: Record<string, unknown> | undefined = (answer['operations'] as Record<string, unknown>[])[0];
                if (first !== undefined) {
                    first['tradeDate'] = '2026-07-09';
                }
            })
        );

        expect(lineOf(earlier, 'AAPL', 'buy').status).toBe('check');
        expect(earlier.warnings).toContainEqual({ code: 'out_of_order', count: 1 });
    });

    it('nem CUSIP, nem nome do titular, nem conta aparecem em log', () => {
        expect(logged.join('\n')).not.toMatch(/AAA111AA0|BBB222BB0|PESSOA EXEMPLO|AVN-0009876/);
    });
});
