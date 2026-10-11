import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, inject } from 'vitest';
import { AppModule } from '../../src/app.module';
import { CommandReconcilerService } from '../../src/core/queue/command-reconciler.service';
import { BULL_PREFIX } from '../../src/shared/constants/queues.constants';
import { DateUtil } from '../../src/shared/utils/date.util';
import { CatalogSyncTickHandler } from '../../src/modules/catalog/access/commands/catalog-sync.command';
import { CatalogSyncApplication } from '../../src/modules/catalog/application/catalog-sync.application';
import { SyncRunOutcome } from '../../src/modules/catalog/domain/catalog.types';
import { ASSET_SOURCES, AssetSourcePort, SourceAsset } from '../../src/modules/catalog/ports/asset-source.port';
import { createIsolatedDatabase, IsolatedDatabase } from './support/isolated-database';
import { isolateRedisForWorker } from './support/queue';

interface AssetRow {
    readonly externalId: string;
    readonly status: string;
    readonly updatedAt: Date;
}

interface RunRow {
    readonly source: string;
    readonly status: string;
    readonly fetched: number;
    readonly upserted: number;
    readonly delisted: number;
    readonly errorCode: string | null;
}

class ScriptedSource extends AssetSourcePort {
    public assets: SourceAsset[] = [];
    public failure: Error | null = null;

    public constructor(public readonly source: AssetSourcePort['source']) {
        super();
    }

    public async fetchAll(): Promise<readonly SourceAsset[]> {
        if (this.failure) {
            return Promise.reject(this.failure);
        }
        return Promise.resolve(this.assets);
    }
}

function stock(symbol: string): SourceAsset {
    return { externalId: symbol, symbol, name: `${symbol} S.A.`, kind: 'stock', currency: 'BRL', raw: {} };
}

function tickers(count: number, from: number = 0): SourceAsset[] {
    return Array.from({ length: count }, (_unused: unknown, index: number) => stock(`TST${String(from + index)}3`));
}

describe('catalog sync', () => {
    const b3: ScriptedSource = new ScriptedSource('b3');
    const tesouro: ScriptedSource = new ScriptedSource('tesouro');
    let app: INestApplication;
    let isolated: IsolatedDatabase;
    let pg: Client;
    let sync: CatalogSyncApplication;
    let redis: Redis;
    let queue: Queue;

    beforeAll(async () => {
        isolated = await createIsolatedDatabase('catalog_sync');
        process.env['DATABASE_URL'] = isolated.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';

        const testing: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(ASSET_SOURCES)
            .useValue([b3, tesouro])
            .compile();
        app = testing.createNestApplication();
        await app.init();
        sync = app.get(CatalogSyncApplication, { strict: false });
        pg = new Client({ connectionString: isolated.url });
        await pg.connect();
        const [host, port] = inject('redisNode').split(':');
        redis = new Redis({ host, port: Number(port), db: Number(process.env['REDIS_DB']), maxRetriesPerRequest: null });
        queue = new Queue('vera-catalog', { connection: redis, prefix: BULL_PREFIX });
    });

    afterAll(async () => {
        await queue.close();
        redis.disconnect();
        await pg.end();
        await app.close();
        await isolated.drop();
    });

    beforeEach(async () => {
        await pg.query('DELETE FROM "Assets"');
        await pg.query('DELETE FROM "CatalogSyncRuns"');
        b3.failure = null;
        b3.assets = [];
    });

    async function assets(): Promise<AssetRow[]> {
        return (
            await pg.query<AssetRow>(`SELECT "externalId", status, "updatedAt" FROM "Assets" WHERE market = 'B3' ORDER BY "externalId"`)
        ).rows;
    }

    async function runs(): Promise<RunRow[]> {
        return (
            await pg.query<RunRow>(
                `SELECT source, status, fetched, upserted, delisted, "errorCode" FROM "CatalogSyncRuns" WHERE source = 'b3' ORDER BY "startedAt"`
            )
        ).rows;
    }

    it('keeps the row count and the updatedAt of every asset across two identical rounds', async () => {
        b3.assets = [stock('ITUB4'), stock('WEGE3'), { ...stock('HGLG11'), kind: 'fii' }];

        await sync.runSource('b3');
        const first: AssetRow[] = await assets();
        await sync.runSource('b3');
        const second: AssetRow[] = await assets();

        expect(first).toHaveLength(3);
        expect(second).toEqual(first);
        expect(await runs()).toEqual([
            { source: 'b3', status: 'succeeded', fetched: 3, upserted: 3, delisted: 0, errorCode: null },
            { source: 'b3', status: 'succeeded', fetched: 3, upserted: 0, delisted: 0, errorCode: null }
        ]);
    });

    it('delists an asset that disappears from a good round and brings it back when it returns', async () => {
        b3.assets = tickers(10);
        await sync.runSource('b3');

        b3.assets = tickers(9);
        const dropped: SyncRunOutcome | null = await sync.runSource('b3');
        const gone: AssetRow | undefined = (await assets()).find((row: AssetRow) => row.externalId === 'TST93');

        expect(dropped).toMatchObject({ status: 'succeeded', fetched: 9, delisted: 1 });
        expect(gone?.status).toBe('delisted');

        b3.assets = tickers(10);
        await sync.runSource('b3');

        expect((await assets()).find((row: AssetRow) => row.externalId === 'TST93')?.status).toBe('active');
    });

    it('records skipped_suspicious and delists nothing when a round returns under 80% of the previous count', async () => {
        b3.assets = tickers(10);
        await sync.runSource('b3');

        b3.assets = tickers(7);
        const outcome: SyncRunOutcome | null = await sync.runSource('b3');

        expect(outcome).toMatchObject({ status: 'skipped_suspicious', fetched: 7, upserted: 0, delisted: 0 });
        expect((await assets()).filter((row: AssetRow) => row.status === 'active')).toHaveLength(10);
        expect((await runs()).at(-1)?.status).toBe('skipped_suspicious');
    });

    it('records a source failure without touching the other sources', async () => {
        tesouro.assets = [
            {
                externalId: 'selic:2029-03-01',
                symbol: 'Tesouro Selic 2029',
                name: 'Tesouro Selic 2029-03-01',
                kind: 'treasury',
                currency: 'BRL',
                maturityDate: '2029-03-01',
                raw: {}
            }
        ];
        b3.assets = tickers(3);
        await sync.runSource('b3');
        b3.failure = new Error('provedor fora do ar');

        await expect(sync.runSource('b3')).rejects.toThrow();
        const outcome: SyncRunOutcome | null = await sync.runSource('tesouro');

        expect(outcome).toMatchObject({ status: 'succeeded', fetched: 1 });
        expect((await runs()).at(-1)).toMatchObject({ status: 'failed', errorCode: 'catalog.sync_unexpected' });
        expect((await assets()).filter((row: AssetRow) => row.status === 'active')).toHaveLength(3);
        const treasury = await pg.query(`SELECT "maturityDate"::text AS d, "suggestedClassKey" FROM "Assets" WHERE market = 'TESOURO'`);
        expect(treasury.rows).toEqual([{ d: '2029-03-01', suggestedClassKey: 'rf_pos' }]);
    });

    it('registers both cron schedulers and fans out one job per source with a deterministic job id', async () => {
        const reconciler: CommandReconcilerService = app.get(CommandReconcilerService, { strict: false });
        await reconciler.onApplicationBootstrap();
        const schedulers: string[] = (await queue.getJobSchedulers()).map((scheduler) => scheduler.key).sort();

        expect(schedulers).toEqual(['catalog-sync-tesouro-daily-command', 'catalog-sync-weekly-command']);

        const handler: CatalogSyncTickHandler = app.get(CatalogSyncTickHandler, { strict: false });
        await handler.handle({
            type: 'catalog.sync.tick.requested',
            requestId: 'req',
            companyId: null,
            occurredAt: new Date().toISOString(),
            trace: {},
            payload: {}
        });
        const day: string = DateUtil.todayInBrazil();

        expect(await queue.getJob(`catalog-sync-b3-${day}`)).toBeDefined();
        expect(await queue.getJob(`catalog-sync-tesouro-${day}`)).toBeDefined();
        expect(await queue.getJob(`catalog-sync-us-${day}`)).toBeUndefined();
        await handler.handle({
            type: 'catalog.sync.tick.requested',
            requestId: 'req',
            companyId: null,
            occurredAt: new Date().toISOString(),
            trace: {},
            payload: { cadence: 'weekly' }
        });
        expect(
            (await queue.getJobs(['waiting', 'active', 'completed', 'delayed'])).filter((job) => job.id?.startsWith('catalog-sync-b3-'))
                .length
        ).toBe(1);
    });
});
