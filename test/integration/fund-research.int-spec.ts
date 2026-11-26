import { afterAll, beforeAll, describe, expect, it, MockInstance, vi } from 'vitest';
import { DateUtil } from '../../src/shared/utils/date.util';
import { IdUtil } from '../../src/shared/utils/id.util';
import { IndexSyncApplication } from '../../src/modules/fixed-income/application/index-sync.application';
import { CvmDailyInformeReaderService, DailyQuote } from '../../src/modules/catalog/services/cvm-daily-informe-reader.service';
import { FundPerformanceService } from '../../src/modules/market-benchmarks/services/fund-performance.service';
import { AssetLookupService } from '../../src/modules/market-benchmarks/services/asset-lookup.service';
import { FundQuoteHistoryService } from '../../src/modules/market-data/services/fund-quote-history.service';
import { MarketDataPruneService } from '../../src/modules/market-data/services/market-data-prune.service';
import { AllocationHarness } from './support/allocation-harness';

process.env['FIXED_INCOME_INDEX_DRIVER'] = 'mock';
process.env['MARKET_DATA_DRIVER'] = 'mock';

const TODAY: string = DateUtil.todayInBrazil();
const FOUR_YEARS_AGO: string = `${String(Number(TODAY.slice(0, 4)) - 4)}-01-01`;
const SERIES_KEY: string = '11111111000191';
const FUND_ID: string = IdUtil.newId();

function monthKeyOf(offset: number): string {
    const year: number = Number(TODAY.slice(0, 4));
    const index: number = year * 12 + Number(TODAY.slice(5, 7)) - 1 - offset;
    return `${String(Math.floor(index / 12))}${String((index % 12) + 1).padStart(2, '0')}`;
}

function daily(month: string): DailyQuote[] {
    const base: number = Number(month.slice(0, 4)) * 12 + Number(month.slice(4)) - 1;
    return [5, 15, 25].map((day: number): DailyQuote => ({
        date: `${month.slice(0, 4)}-${month.slice(4)}-${String(day).padStart(2, '0')}`,
        quota: (1 + (base - 24000) * 0.01 + day * 0.0001).toFixed(6)
    }));
}

describe('pesquisa de ativo e fundo', () => {
    let harness: AllocationHarness;
    let monthPoints: MockInstance;

    beforeAll(async () => {
        harness = await AllocationHarness.start('fund_research');
        await harness.pg.query(
            `INSERT INTO "Assets" (id, market, "externalId", symbol, name, kind, "typeGroup", currency, "quotesProvider", "quantityDecimals")
             VALUES ($1, 'CVM', $2, 'ALFA', 'Fundo Alfa Referenciado DI', 'fund', 'fundos', 'BRL', 'cvm', 6)`,
            [FUND_ID, SERIES_KEY]
        );
        const reader: CvmDailyInformeReaderService = harness.app.get(CvmDailyInformeReaderService, { strict: false });
        monthPoints = vi
            .spyOn(reader, 'monthPoints')
            .mockImplementation((month: string): Promise<readonly DailyQuote[]> => Promise.resolve(daily(month)));
    });

    afterAll(async () => {
        await harness.stop();
    });

    it('as tabelas de histórico do fundo existem, com a cascata do ativo', async () => {
        const columns = await harness.pg.query<{ table_name: string; column_name: string }>(
            `SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('FundQuotePoints', 'FundQuoteCoverage') ORDER BY table_name, ordinal_position`
        );
        const cascade = await harness.pg.query<{ total: string }>(
            `SELECT count(*) AS total FROM information_schema.referential_constraints WHERE constraint_name IN (SELECT constraint_name FROM information_schema.table_constraints WHERE table_name IN ('FundQuotePoints', 'FundQuoteCoverage')) AND delete_rule = 'CASCADE'`
        );

        expect(columns.rows.filter((row) => row.table_name === 'FundQuotePoints').map((row) => row.column_name)).toEqual([
            'id',
            'assetId',
            'date',
            'quota',
            'createdAt',
            'fetchedAt'
        ]);
        expect(columns.rows.filter((row) => row.table_name === 'FundQuoteCoverage').map((row) => row.column_name)).toEqual([
            'id',
            'assetId',
            'coveredFrom',
            'coveredTo',
            'readAt',
            'createdAt',
            'updatedAt'
        ]);
        expect(Number(cascade.rows[0]?.total)).toBe(2);
    });

    it('baixa só os meses necessários uma vez, guarda os pontos e na segunda leitura não baixa nada', async () => {
        const history: FundQuoteHistoryService = harness.app.get(FundQuoteHistoryService, { strict: false });
        const from: string = `${monthKeyOf(2).slice(0, 4)}-${monthKeyOf(2).slice(4)}-10`;

        const first = await history.history({ assetId: FUND_ID, seriesKey: SERIES_KEY }, from, TODAY);
        const calls: number = monthPoints.mock.calls.length;
        const second = await history.history({ assetId: FUND_ID, seriesKey: SERIES_KEY }, from, TODAY);

        expect(calls).toBe(3);
        expect(monthPoints.mock.calls.map((call) => call[0] as string)).toEqual([monthKeyOf(2), monthKeyOf(1), monthKeyOf(0)]);
        expect(monthPoints.mock.calls).toHaveLength(calls);
        expect(first.complete).toBe(true);
        expect(second.points).toEqual(first.points);
        const stored = await harness.pg.query<{ total: string }>(`SELECT count(*) AS total FROM "FundQuotePoints" WHERE "assetId" = $1`, [
            FUND_ID
        ]);
        expect(Number(stored.rows[0]?.total)).toBe(9);
        const usage = await harness.pg.query<{ count: number }>(
            `SELECT count FROM "ProviderUsage" WHERE provider = 'cvm' AND "windowKind" = 'day'`
        );
        expect(usage.rows[0]?.count).toBe(3);
    });

    it('a rentabilidade do fundo sai com o CDI da mesma janela e a diferença, baixando os meses que faltam para a janela longa', async () => {
        const sync: IndexSyncApplication = harness.app.get(IndexSyncApplication, { strict: false });
        await sync.syncWindow({ series: 'cdi_daily', from: FOUR_YEARS_AGO, to: TODAY });

        const result = await harness.app
            .get(FundPerformanceService, { strict: false })
            .performance({ fundKey: SERIES_KEY, windows: ['m1', 'm36'], asOf: TODAY });

        expect(result.state).toBe('ok');
        expect(result.name).toBe('Fundo Alfa Referenciado DI');
        expect(result.missing).toEqual([]);
        expect(result.windows.m36?.fundBps).toBeGreaterThan(0);
        expect(monthPoints.mock.calls.length).toBeGreaterThan(30);
        expect(result.windows.m1?.fundBps).toBeGreaterThan(0);
        expect(result.windows.m1?.cdiBps).toBeGreaterThan(0);
        expect(result.windows.m1?.differenceBps).toBe((result.windows.m1?.fundBps ?? 0) - (result.windows.m1?.cdiBps ?? 0));
    });

    it('a pesquisa acha o fundo pelo nome e devolve a chave para a rentabilidade', async () => {
        const found = await harness.app.get(AssetLookupService, { strict: false }).lookup('alfa referenciado');

        expect(found[0]).toMatchObject({ externalId: SERIES_KEY, symbol: 'ALFA', kind: 'fund' });
    });

    it('a limpeza apaga pontos além da retenção e o histórico de fundo que ninguém lê', async () => {
        await harness.pg.query(`INSERT INTO "FundQuotePoints" (id, "assetId", date, quota) VALUES ($1, $2, '2020-01-10', 1.1)`, [
            IdUtil.newId(),
            FUND_ID
        ]);
        await harness.app.get(MarketDataPruneService, { strict: false }).pruneAll();
        const old = await harness.pg.query<{ total: string }>(`SELECT count(*) AS total FROM "FundQuotePoints" WHERE date < '2021-01-01'`);
        expect(Number(old.rows[0]?.total)).toBe(0);

        await harness.pg.query(`UPDATE "FundQuoteCoverage" SET "readAt" = now() - interval '120 days'`);
        await harness.app.get(MarketDataPruneService, { strict: false }).pruneAll();
        const left = await harness.pg.query<{ points: string; coverage: string }>(
            `SELECT (SELECT count(*) FROM "FundQuotePoints") AS points, (SELECT count(*) FROM "FundQuoteCoverage") AS coverage`
        );
        expect(left.rows[0]).toEqual({ points: '0', coverage: '0' });
    });
});
