import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DateUtil } from '../../src/shared/utils/date.util';
import { IndexSyncApplication } from '../../src/modules/fixed-income/application/index-sync.application';
import { IndexSeriesDomain } from '../../src/modules/fixed-income/domain/index-series.domain';
import { MOCK_MONTHLY_IPCA } from '../../src/modules/fixed-income/drivers/mock-index-series.driver';
import { AllocationHarness } from './support/allocation-harness';
import { bullPrefixFromEnvironment } from '../../src/shared/config/bull-prefix';

process.env['FIXED_INCOME_INDEX_DRIVER'] = 'mock';

const TODAY: string = DateUtil.todayInBrazil();

async function eventually<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeoutMs: number = 30000): Promise<T> {
    const deadline: number = Date.now() + timeoutMs;
    let value: T = await read();
    while (!accept(value) && Date.now() < deadline) {
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
        value = await read();
    }
    return value;
}

describe('fixed income index sync', () => {
    let harness: AllocationHarness;
    let sync: IndexSyncApplication;
    let queue: Queue;
    let redis: Redis;

    beforeAll(async () => {
        harness = await AllocationHarness.start('fixed_income_sync');
        sync = harness.app.get(IndexSyncApplication, { strict: false });
        redis = new Redis({
            host: (process.env['REDIS_NODES'] ?? '').split(':')[0],
            port: Number((process.env['REDIS_NODES'] ?? '').split(':')[1]),
            db: Number(process.env['REDIS_DB'] ?? '0'),
            maxRetriesPerRequest: null
        });
        queue = new Queue('vera-fixed-income', { connection: redis, prefix: bullPrefixFromEnvironment() });
    });

    afterAll(async () => {
        await queue.close();
        redis.disconnect();
        await harness.stop();
    });

    async function countPoints(series: string): Promise<number> {
        const result = await harness.pg.query<{ total: string }>('SELECT count(*) AS total FROM "IndexSeriesPoints" WHERE "series" = $1', [
            series
        ]);
        return Number(result.rows[0]?.total);
    }

    it('o comando diário às 09:30 está registrado no Redis', async () => {
        const schedulers = await eventually(
            async () => queue.getJobSchedulers(),
            (found) => found.length > 0
        );

        const command = schedulers.find((scheduler) => scheduler.key === 'fixed-income-index-sync-command');
        expect(command?.pattern).toBe('30 9 * * *');
        expect(command?.name).toBe('fixed-income.index-sync.requested');
    });

    it('o tick publica um job por série e janela com jobId determinístico, faz o backfill e rodar de novo não duplica pontos', async () => {
        await sync.requestSync();

        const firstWindow = 'fixed-income-index-sync-cdi-daily-2010-01-01-2010-12-31';
        const lastWindow = `fixed-income-index-sync-ipca-monthly-${TODAY.slice(0, 4)}-01-01-${TODAY}`;
        const domain: IndexSeriesDomain = harness.app.get(IndexSeriesDomain, { strict: false });
        await eventually(
            async () => domain.lastPointDate('ipca_monthly'),
            (last) => last !== null && last >= `${TODAY.slice(0, 7)}-01`
        );
        await eventually(
            async () => queue.getJobCounts('active', 'waiting'),
            (counts) => counts['active'] === 0 && counts['waiting'] === 0
        );

        expect((await queue.getJob(firstWindow))?.name).toBe('fixed-income.index-sync.series.requested');
        expect((await queue.getJob(lastWindow))?.data).toMatchObject({
            payload: { series: 'ipca_monthly', from: `${TODAY.slice(0, 4)}-01-01`, to: TODAY }
        });
        const cdiBefore: number = await countPoints('cdi_daily');
        const ipcaBefore: number = await countPoints('ipca_monthly');
        expect(cdiBefore).toBeGreaterThan(4000);
        expect(ipcaBefore).toBeGreaterThanOrEqual(200);

        await sync.requestSync();
        await sync.syncWindow({ series: 'cdi_daily', from: '2024-01-01', to: TODAY });
        await sync.syncWindow({ series: 'ipca_monthly', from: '2024-01-01', to: TODAY });

        expect(await countPoints('cdi_daily')).toBe(cdiBefore);
        expect(await countPoints('ipca_monthly')).toBe(ipcaBefore);
    });

    it('as rodadas seguintes buscam só do último ponto até hoje', async () => {
        const domain: IndexSeriesDomain = harness.app.get(IndexSeriesDomain, { strict: false });

        const last: string | null = await domain.lastPointDate('cdi_daily');

        expect(last).not.toBeNull();
        expect((last as string) <= TODAY).toBe(true);
        const row = await harness.pg.query<{ value: string; source: string }>(
            `SELECT "value", "source" FROM "IndexSeriesPoints" WHERE "series" = 'ipca_monthly' ORDER BY "date" DESC LIMIT 1`
        );
        expect(Number(row.rows[0]?.value)).toBe(Number(MOCK_MONTHLY_IPCA));
        expect(row.rows[0]?.source).toBe('mock');
    });
});
