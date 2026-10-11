import { INestApplication, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, inject } from 'vitest';
import { AppModule } from '../../src/app.module';
import { QueuePublisherPort } from '../../src/core/queue/queue.types';
import { CatalogSyncApplication } from '../../src/modules/catalog/application/catalog-sync.application';
import { QuotesChunkApplication } from '../../src/modules/market-data/application/quotes-chunk.application';
import { QuotesSweepApplication } from '../../src/modules/market-data/application/quotes-sweep.application';
import { ReferenceDataApplication } from '../../src/modules/market-data/application/reference-data.application';
import { HeldAssetsPort } from '../../src/modules/market-data/services/held-assets.port';
import { QUOTE_PROVIDERS, QuoteProviderPort } from '../../src/modules/market-data/ports/quote-provider.port';
import { ProviderBudgetService } from '../../src/modules/market-data/services/provider-budget.service';
import { createIsolatedDatabase, IsolatedDatabase } from './support/isolated-database';
import { CapturingPublisher, isolateRedisForWorker, PublishedMessage } from './support/queue';

interface QuoteRow {
    readonly assetId: string;
    readonly source: string;
    readonly fetchedAt: Date;
    readonly priceDate: string;
}

const COMPANY_A_SYMBOLS: string[] = ['ITUB4', 'WEGE3', 'VOO', 'bitcoin'];
const COMPANY_B_SYMBOLS: string[] = ['ITUB4', 'VOO', 'ethereum', 'selic:2029-03-01'];

class HeldByCompanyA extends HeldAssetsPort {
    public static ids: string[] = [];

    public listHeldAssetIdsAcrossTenants(): Promise<readonly string[]> {
        return Promise.resolve(HeldByCompanyA.ids);
    }
}

class HeldByCompanyB extends HeldAssetsPort {
    public static ids: string[] = [];

    public listHeldAssetIdsAcrossTenants(): Promise<readonly string[]> {
        return Promise.resolve(HeldByCompanyB.ids);
    }
}

@Module({ providers: [HeldByCompanyA, HeldByCompanyB] })
class TestHeldModule {}

describe('market-data sweep', () => {
    const publisher: CapturingPublisher = new CapturingPublisher();
    let app: INestApplication;
    let isolated: IsolatedDatabase;
    let pg: Client;
    let distinctHeld: string[];
    let fetchedAssets: string[];

    beforeAll(async () => {
        isolated = await createIsolatedDatabase('market_data_sweep');
        process.env['DATABASE_URL'] = isolated.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';
        process.env['CATALOG_DRIVER'] = 'mock';
        process.env['MARKET_DATA_DRIVER'] = 'mock';
        process.env['FINNHUB_API_KEY'] = '';
        process.env['FINNHUB_LIMIT_MINUTE'] = '3';

        const testing: TestingModule = await Test.createTestingModule({ imports: [AppModule, TestHeldModule] })
            .overrideProvider(QueuePublisherPort)
            .useValue(publisher)
            .compile();
        app = testing.createNestApplication();
        await app.init();
        pg = new Client({ connectionString: isolated.url });
        await pg.connect();
        await app.get(CatalogSyncApplication, { strict: false }).syncAllNow();
        HeldByCompanyA.ids = await idsOf(COMPANY_A_SYMBOLS);
        HeldByCompanyB.ids = await idsOf(COMPANY_B_SYMBOLS);
        distinctHeld = [...new Set([...HeldByCompanyA.ids, ...HeldByCompanyB.ids])];
        fetchedAssets = [];
        for (const port of app.get<QuoteProviderPort[]>(QUOTE_PROVIDERS)) {
            const original = port.fetchBatch.bind(port);
            port.fetchBatch = async (assets) => {
                fetchedAssets.push(...assets.map((asset) => asset.assetId));
                return original(assets);
            };
        }
    });

    afterAll(async () => {
        await pg.end();
        await app.close();
        await isolated.drop();
    });

    afterEach(async () => {
        await pg.query('TRUNCATE "ProviderUsage"');
    });

    async function idsOf(externalIds: string[]): Promise<string[]> {
        const result = await pg.query<{ id: string }>('SELECT id FROM "Assets" WHERE "externalId" = ANY($1)', [externalIds]);
        return result.rows.map((row) => row.id);
    }

    async function newCompany(): Promise<string> {
        const id: string = crypto.randomUUID();
        await pg.query(`INSERT INTO "Companies" (id, name) VALUES ($1, 'Empresa posicao')`, [id]);
        return id;
    }

    async function addPosition(companyId: string, assetId: string, removed: boolean): Promise<void> {
        await pg.query(`INSERT INTO "Positions" (id, "companyId", "assetId", quantity, "deletedAt") VALUES ($1, $2, $3, 1, $4)`, [
            crypto.randomUUID(),
            companyId,
            assetId,
            removed ? new Date() : null
        ]);
    }

    async function quotes(): Promise<QuoteRow[]> {
        return (
            await pg.query<QuoteRow>(
                `SELECT "assetId", source, "fetchedAt", to_char("priceDate", 'YYYY-MM-DD') AS "priceDate" FROM "AssetQuotes" ORDER BY "assetId"`
            )
        ).rows;
    }

    async function runChunks(messages: PublishedMessage[]): Promise<void> {
        const chunks = app.get(QuotesChunkApplication, { strict: false });
        for (const message of messages.filter((entry) => entry.type === 'market-data.quotes.chunk.requested')) {
            await chunks.handleChunk(message.payload);
        }
    }

    it('fetches once per distinct asset across companies and stores one row per asset', async () => {
        const sweep = app.get(QuotesSweepApplication, { strict: false });

        const chunks: number = await sweep.handleTick();
        await runChunks(publisher.published);
        await app.get(ReferenceDataApplication, { strict: false }).handleReference();

        const published: string[] = publisher.published.flatMap((message) => (message.payload as { assetIds: string[] }).assetIds);
        const sweepable: string[] = distinctHeld.filter((id) => id !== HeldByCompanyB.ids[3]);
        expect(chunks).toBeGreaterThan(0);
        expect([...published].sort()).toEqual([...sweepable].sort());
        expect(new Set(published).size).toBe(published.length);
        expect(fetchedAssets.length).toBe(distinctHeld.length);
        expect(new Set(fetchedAssets).size).toBe(distinctHeld.length);

        const rows: QuoteRow[] = await quotes();
        expect(rows.map((row) => row.assetId).sort()).toEqual([...distinctHeld].sort());
        expect(rows.every((row) => row.source === 'mock')).toBe(true);
    });

    it('stores the mock PTAX for the current date', async () => {
        const rates = await pg.query<{ currency: string; brlPerUnit: string; source: string }>(
            'SELECT currency, "brlPerUnit", source FROM "ExchangeRates"'
        );

        expect(rates.rows).toEqual([{ currency: 'USD', brlPerUnit: '5.4200000000', source: 'mock' }]);
    });

    it('keeps the same job ids and rewrites nothing when the tick runs twice in a day', async () => {
        const before: QuoteRow[] = await quotes();
        const firstIds: unknown[] = publisher.published.map((message) => message.options?.jobId);
        const callsBefore: number = fetchedAssets.length;
        publisher.published.length = 0;

        await app.get(QuotesSweepApplication, { strict: false }).handleTick();
        await runChunks(publisher.published);

        expect(publisher.published.map((message) => message.options?.jobId)).toEqual(
            firstIds.filter((id) => (id as string).startsWith('quotes-chunk-'))
        );
        expect(fetchedAssets.length).toBe(callsBefore);
        expect(await quotes()).toEqual(before);
    });

    it('refetches only the asset whose stored quote is older than the expected session', async () => {
        const target: string = HeldByCompanyA.ids[0] ?? '';
        await pg.query(`UPDATE "AssetQuotes" SET "priceDate" = '2020-01-02' WHERE "assetId" = $1`, [target]);
        const callsBefore: number = fetchedAssets.length;
        publisher.published.length = 0;

        await app.get(QuotesSweepApplication, { strict: false }).handleTick();
        await runChunks(publisher.published);

        expect(fetchedAssets.length - callsBefore).toBe(1);
        expect(fetchedAssets.at(-1)).toBe(target);
        expect((await quotes()).find((row) => row.assetId === target)?.priceDate).not.toBe('2020-01-02');
    });

    it('counts the persisted budget atomically under concurrent reservations', async () => {
        const budget = app.get(ProviderBudgetService, { strict: false });

        const answers: boolean[] = await Promise.all(Array.from({ length: 12 }, async () => budget.reserve('finnhub', 1)));

        expect(answers.filter(Boolean)).toHaveLength(3);
        const usage = await pg.query<{ windowKind: string; count: number }>(
            'SELECT "windowKind", count FROM "ProviderUsage" WHERE provider = $1',
            ['finnhub']
        );
        expect(usage.rows).toEqual([{ windowKind: 'minute', count: 3 }]);
    });

    it('prunes usage rows older than forty days', async () => {
        await pg.query(
            `INSERT INTO "ProviderUsage" (id, provider, "windowKind", "windowStart", count) VALUES ($1, 'brapi', 'month', now() - interval '60 days', 9), ($2, 'brapi', 'month', now(), 1)`,
            [crypto.randomUUID(), crypto.randomUUID()]
        );

        await app.get(ProviderBudgetService, { strict: false }).pruneOldUsage();

        const remaining = await pg.query<{ count: number }>(`SELECT count FROM "ProviderUsage" WHERE provider = 'brapi'`);
        expect(remaining.rows).toEqual([{ count: 1 }]);
    });

    it('picks up the assets of real positions across companies, once each, and ignores removed ones', async () => {
        const [petr, bbas, vale] = await idsOf(['PETR4', 'BBAS3', 'VALE3']);
        const companyA: string = await newCompany();
        const companyB: string = await newCompany();
        await addPosition(companyA, petr ?? '', false);
        await addPosition(companyB, petr ?? '', false);
        await addPosition(companyB, bbas ?? '', false);
        await addPosition(companyA, vale ?? '', true);
        HeldByCompanyA.ids = [];
        HeldByCompanyB.ids = [];
        publisher.published.length = 0;

        await app.get(QuotesSweepApplication, { strict: false }).handleTick();

        const published: string[] = publisher.published.flatMap((message) => (message.payload as { assetIds: string[] }).assetIds);
        expect([...published].sort()).toEqual([petr ?? '', bbas ?? ''].sort());
    });
});
