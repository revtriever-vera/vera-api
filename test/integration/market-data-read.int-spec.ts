import { AddressInfo, Server } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, inject } from 'vitest';
import { AppModule } from '../../src/app.module';
import { AppContext } from '../../src/core/context/app-context.port';
import { QueuePublisherPort } from '../../src/core/queue/queue.types';
import { CatalogSyncApplication } from '../../src/modules/catalog/application/catalog-sync.application';
import { CompanyDomain } from '../../src/modules/identity/domain/company.domain';
import { Company, User } from '../../src/modules/identity/domain/identity.types';
import { UserDomain } from '../../src/modules/identity/domain/user.domain';
import { AuthTokens, SessionIssuerPort } from '../../src/modules/identity/ports/session-issuer.port';
import { QuotesChunkApplication } from '../../src/modules/market-data/application/quotes-chunk.application';
import { createIsolatedDatabase, IsolatedDatabase } from './support/isolated-database';
import { CapturingPublisher, isolateRedisForWorker } from './support/queue';

interface QuotesBody {
    readonly quotes: { assetId: string; price: string; currency: string; priceDate: string; source: string; stale: boolean }[];
    readonly pendingAssetIds: string[];
}

interface ProblemBody {
    readonly type: string;
    readonly status: number;
}

describe('market-data read', () => {
    const publisher: CapturingPublisher = new CapturingPublisher();
    let app: INestApplication;
    let origin: string;
    let isolated: IsolatedDatabase;
    let pg: Client;
    let token: string;
    let itub: string;
    let wege: string;
    let petr: string;

    beforeAll(async () => {
        isolated = await createIsolatedDatabase('market_data_read');
        process.env['DATABASE_URL'] = isolated.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';
        process.env['CATALOG_DRIVER'] = 'mock';
        process.env['MARKET_DATA_DRIVER'] = 'mock';

        const testing: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(QueuePublisherPort)
            .useValue(publisher)
            .compile();
        app = testing.createNestApplication();
        await app.init();
        await app.listen(0);
        origin = `http://127.0.0.1:${String(((app.getHttpServer() as Server).address() as AddressInfo).port)}`;
        pg = new Client({ connectionString: isolated.url });
        await pg.connect();
        await app.get(CatalogSyncApplication, { strict: false }).syncAllNow();
        itub = await assetId('ITUB4');
        wege = await assetId('WEGE3');
        petr = await assetId('PETR4');
        token = await signUp();
    });

    afterAll(async () => {
        await pg.end();
        await app.close();
        await isolated.drop();
    });

    beforeEach(async () => {
        publisher.published.length = 0;
        await pg.query('DELETE FROM "AssetQuotes"');
        await pg.query('DELETE FROM "ExchangeRates"');
    });

    async function assetId(externalId: string): Promise<string> {
        return (await pg.query<{ id: string }>('SELECT id FROM "Assets" WHERE "externalId" = $1', [externalId])).rows[0]?.id ?? '';
    }

    async function signUp(): Promise<string> {
        const context: AppContext = app.get(AppContext);
        const company: Company = await app.get(CompanyDomain, { strict: false }).create({ name: 'Empresa cotacoes' });
        const user: User = await context.run({ requestId: 'test', companyId: company.id, locale: 'pt-BR' }, async () =>
            app.get(UserDomain, { strict: false }).createOwner({
                email: `cotacoes-${crypto.randomUUID()}@example.com`,
                name: 'Pessoa cotacoes',
                emailVerifiedAt: new Date(),
                termsAcceptedAt: new Date()
            })
        );
        const tokens: AuthTokens = await context.run({ requestId: 'test', companyId: company.id, locale: 'pt-BR' }, async () =>
            app.get(SessionIssuerPort, { strict: false }).issueForNewLogin(user, { ip: '203.0.113.7', userAgent: 'int-test' }, 'google')
        );
        return tokens.accessToken;
    }

    async function get(path: string, bearer: string | null = token): Promise<Response> {
        return fetch(`${origin}${path}`, { headers: bearer === null ? {} : { authorization: `Bearer ${bearer}` } });
    }

    async function storeQuote(id: string, price: string, priceDate: string): Promise<void> {
        await pg.query(`INSERT INTO "AssetQuotes" ("assetId", price, currency, "priceDate", source) VALUES ($1, $2, 'BRL', $3, 'brapi')`, [
            id,
            price,
            priceDate
        ]);
    }

    it('returns what is stored and lists the rest as pending, queueing one fetch per asset per day', async () => {
        const today: string = new Date().toISOString().slice(0, 10);
        await storeQuote(itub, '37.80000000', today);

        const response: Response = await get(`/market-data/quotes?assetIds=${itub},${wege}`);
        const body: QuotesBody = (await response.json()) as QuotesBody;

        expect(response.status).toBe(200);
        expect(body.quotes).toEqual([{ assetId: itub, price: '37.8', currency: 'BRL', priceDate: today, source: 'brapi', stale: false }]);
        expect(body.pendingAssetIds).toEqual([wege]);
        const queued = publisher.ofType('market-data.quote.ondemand.requested');
        expect(queued.map((message) => message.payload)).toEqual([{ assetId: wege }]);
        expect(queued[0]?.options?.jobId).toMatch(new RegExp(`^quote-ondemand-${wege}-\\d{4}-\\d{2}-\\d{2}$`));
    });

    it('flags an old price as stale, keeps showing it and asks for a refresh', async () => {
        await storeQuote(petr, '36.90000000', '2020-01-03');

        const body: QuotesBody = (await (await get(`/market-data/quotes?assetIds=${petr}`)).json()) as QuotesBody;

        expect(body.quotes[0]).toMatchObject({ assetId: petr, stale: true, priceDate: '2020-01-03' });
        expect(body.pendingAssetIds).toEqual([]);
        expect(publisher.ofType('market-data.quote.ondemand.requested')).toHaveLength(1);
    });

    it('fills a pending asset once the on-demand job runs', async () => {
        await get(`/market-data/quotes?assetIds=${wege}`);
        const message = publisher.ofType('market-data.quote.ondemand.requested')[0];

        await app.get(QuotesChunkApplication, { strict: false }).handleOnDemand(message?.payload);

        const body: QuotesBody = (await (await get(`/market-data/quotes?assetIds=${wege}`)).json()) as QuotesBody;
        expect(body.pendingAssetIds).toEqual([]);
        expect(body.quotes[0]).toMatchObject({ assetId: wege, price: '52.1', source: 'mock', stale: false });
    });

    it('rejects a missing session, 31 ids and malformed ids', async () => {
        const ids: string = Array.from({ length: 31 }, () => crypto.randomUUID()).join(',');

        expect((await get(`/market-data/quotes?assetIds=${itub}`, null)).status).toBe(401);
        expect((await get(`/market-data/quotes?assetIds=${ids}`)).status).toBe(400);
        expect((await get('/market-data/quotes?assetIds=nope')).status).toBe(400);
        expect((await get('/market-data/quotes')).status).toBe(400);
    });

    it('returns the latest PTAX on or before today, with its date', async () => {
        await pg.query(
            `INSERT INTO "ExchangeRates" (id, currency, date, "brlPerUnit", source) VALUES ($1, 'USD', '2020-01-02', 4.0000000000, 'bcb-ptax'), ($2, 'USD', '2020-01-03', 4.0200000000, 'bcb-ptax'), ($3, 'USD', '2999-01-01', 9.0000000000, 'bcb-ptax')`,
            [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
        );

        const response: Response = await get('/market-data/exchange-rates/USD');

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ currency: 'USD', brlPerUnit: '4.02', date: '2020-01-03', source: 'bcb-ptax' });
    });

    it('answers 404 with the exchange_rate_unavailable type when there is no rate, 400 for a malformed code, 401 without a session', async () => {
        const missing: Response = await get('/market-data/exchange-rates/USD');
        const problem: ProblemBody = (await missing.json()) as ProblemBody;

        expect(missing.status).toBe(404);
        expect(problem.type).toBe('market-data.exchange_rate_unavailable');
        expect((await get('/market-data/exchange-rates/usd')).status).toBe(400);
        expect((await get('/market-data/exchange-rates/USD', null)).status).toBe(401);
    });
});
