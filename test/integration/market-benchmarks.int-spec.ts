import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DateUtil } from '../../src/shared/utils/date.util';
import { IndexSyncApplication } from '../../src/modules/fixed-income/application/index-sync.application';
import { MarketIndexSyncService } from '../../src/modules/market-data/services/market-index-sync.service';
import { BenchmarkService, BenchmarkWindows } from '../../src/modules/market-benchmarks/services/benchmark.service';
import { AllocationHarness } from './support/allocation-harness';

process.env['FIXED_INCOME_INDEX_DRIVER'] = 'mock';
process.env['MARKET_DATA_DRIVER'] = 'mock';
process.env['BRAPI_INDEX_HISTORY_RANGE'] = '5y';

const TODAY: string = DateUtil.todayInBrazil();
const FOUR_YEARS_AGO: string = `${String(Number(TODAY.slice(0, 4)) - 4)}-01-01`;

describe('market benchmarks', () => {
    let harness: AllocationHarness;

    beforeAll(async () => {
        harness = await AllocationHarness.start('market_benchmarks');
    });

    afterAll(async () => {
        await harness.stop();
    });

    it('a aplicação sobe com o módulo de indicadores e a tabela de pontos do índice existe', async () => {
        const columns = await harness.pg.query<{ column_name: string }>(
            `SELECT column_name FROM information_schema.columns WHERE table_name = 'MarketIndexPoints' ORDER BY ordinal_position`
        );

        expect(columns.rows.map((row) => row.column_name)).toEqual(['symbol', 'date', 'close', 'source', 'fetchedAt']);
        expect(harness.app.get(BenchmarkService, { strict: false })).toBeDefined();
    });

    it('sem nenhum ponto guardado as séries vêm vazias e atrasadas, sem erro', async () => {
        const windows: BenchmarkWindows = await harness.app.get(BenchmarkService, { strict: false }).windows({ asOf: TODAY });

        expect(windows.cdi).toMatchObject({ lastDate: null, stale: true });
        expect(windows.selicTarget).toMatchObject({ lastDate: null, bps: null });
        expect(windows.ibovespa).toMatchObject({ state: 'no_data', lastDate: null });
    });

    it('depois do sync, CDI, IPCA, Selic e Ibovespa saem com janelas e data de referência, e rodar de novo não duplica', async () => {
        const sync: IndexSyncApplication = harness.app.get(IndexSyncApplication, { strict: false });
        for (const series of ['cdi_daily', 'ipca_monthly', 'selic_target_daily'] as const) {
            await sync.syncWindow({ series, from: FOUR_YEARS_AGO, to: TODAY });
        }
        const indexes: MarketIndexSyncService = harness.app.get(MarketIndexSyncService, { strict: false });
        await indexes.syncAll();
        const first = await harness.pg.query<{ total: string }>(`SELECT count(*) AS total FROM "MarketIndexPoints"`);
        await indexes.syncAll();
        const second = await harness.pg.query<{ total: string }>(`SELECT count(*) AS total FROM "MarketIndexPoints"`);

        const windows: BenchmarkWindows = await harness.app.get(BenchmarkService, { strict: false }).windows({ asOf: TODAY });

        expect(Number(first.rows[0]?.total)).toBeGreaterThan(900);
        expect(second.rows[0]?.total).toBe(first.rows[0]?.total);
        expect(windows.cdi.windows.m36).not.toBeNull();
        expect(windows.cdi.windows.m12).toBeGreaterThan(0);
        expect(windows.ipca.windows.m12).toBeGreaterThan(0);
        expect(windows.selicTarget.bps).toBe(1375);
        expect(windows.ibovespa.state).toBe('ok');
        expect((windows.ibovespa.lastDate ?? '') < TODAY).toBe(true);
        expect(windows.ibovespa.windows.m36).toBeGreaterThan(0);
        expect(windows.ibovespa.source).toBe('brapi');
    });
});
