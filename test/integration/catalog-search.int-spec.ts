import { AddressInfo, Server } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { AppModule } from '../../src/app.module';
import { AppContext } from '../../src/core/context/app-context.port';
import { CatalogSyncApplication } from '../../src/modules/catalog/application/catalog-sync.application';
import { CompanyDomain } from '../../src/modules/identity/domain/company.domain';
import { Company, User } from '../../src/modules/identity/domain/identity.types';
import { UserDomain } from '../../src/modules/identity/domain/user.domain';
import { AuthTokens, SessionIssuerPort } from '../../src/modules/identity/ports/session-issuer.port';
import { createIsolatedDatabase, IsolatedDatabase } from './support/isolated-database';
import { isolateRedisForWorker } from './support/queue';

interface ItemBody {
    readonly id: string;
    readonly symbol: string;
    readonly name: string;
    readonly market: string;
    readonly typeGroup: string;
    readonly currency: string;
    readonly suggestedClassKey: string | null;
    readonly dollarExposure: boolean;
    readonly quantityDecimals: number;
    readonly maturityDate: string | null;
}

interface SearchBody {
    readonly data: ItemBody[];
}

interface ProblemBody {
    readonly type: string;
    readonly status: number;
}

describe('catalog search', () => {
    let app: INestApplication;
    let origin: string;
    let isolated: IsolatedDatabase;
    let pg: Client;
    let token: string;
    let companyId: string;

    beforeAll(async () => {
        isolated = await createIsolatedDatabase('catalog_search');
        process.env['DATABASE_URL'] = isolated.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';
        process.env['CATALOG_DRIVER'] = 'mock';

        const testing: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = testing.createNestApplication();
        await app.init();
        await app.listen(0);
        const address: AddressInfo = (app.getHttpServer() as Server).address() as AddressInfo;
        origin = `http://127.0.0.1:${String(address.port)}`;
        pg = new Client({ connectionString: isolated.url });
        await pg.connect();

        await app.get(CatalogSyncApplication, { strict: false }).syncAllNow();
        const session: { token: string; companyId: string } = await signUp();
        token = session.token;
        companyId = session.companyId;
    });

    afterAll(async () => {
        await pg.end();
        await app.close();
        await isolated.drop();
    });

    async function signUp(): Promise<{ token: string; companyId: string }> {
        const context: AppContext = app.get(AppContext);
        const company: Company = await app.get(CompanyDomain, { strict: false }).create({ name: 'Empresa catalogo' });
        const user: User = await context.run({ requestId: 'test', companyId: company.id, locale: 'pt-BR' }, async () =>
            app.get(UserDomain, { strict: false }).createOwner({
                email: `catalogo-${crypto.randomUUID()}@example.com`,
                name: 'Pessoa catalogo',
                emailVerifiedAt: new Date(),
                termsAcceptedAt: new Date()
            })
        );
        const tokens: AuthTokens = await context.run({ requestId: 'test', companyId: company.id, locale: 'pt-BR' }, async () =>
            app.get(SessionIssuerPort, { strict: false }).issueForNewLogin(user, { ip: '203.0.113.7', userAgent: 'int-test' }, 'google')
        );
        return { token: tokens.accessToken, companyId: company.id };
    }

    async function get(path: string, bearer: string | null = token): Promise<Response> {
        return fetch(`${origin}${path}`, { headers: bearer === null ? {} : { authorization: `Bearer ${bearer}` } });
    }

    async function search(query: string): Promise<ItemBody[]> {
        const response: Response = await get(`/catalog/assets?${query}`);
        expect(response.status).toBe(200);
        return ((await response.json()) as SearchBody).data;
    }

    it('finds ITUB4 first for q = itub', async () => {
        const found: ItemBody[] = await search('q=itub');

        expect(found[0]).toMatchObject({
            symbol: 'ITUB4',
            market: 'B3',
            typeGroup: 'acoes_br',
            suggestedClassKey: 'acoes_br',
            currency: 'BRL',
            dollarExposure: false,
            quantityDecimals: 0,
            maturityDate: null
        });
    });

    it('finds IVVB11 inside the US stocks group, classified by exposure', async () => {
        const found: ItemBody[] = await search('q=ivvb&group=acoes_eua');

        expect(found[0]).toMatchObject({ symbol: 'IVVB11', typeGroup: 'acoes_eua', suggestedClassKey: 'acoes_eua', dollarExposure: true });
        expect(await search('q=ivvb&group=fii')).toEqual([]);
    });

    it('orders exact symbol before symbol prefix before name similarity', async () => {
        const found: ItemBody[] = await search('q=o&group=reits');

        expect(found[0]?.symbol).toBe('O');
    });

    it('finds crypto by name and Tesouro by title', async () => {
        const crypto: ItemBody[] = await search('q=bitcoin');
        const tesouro: ItemBody[] = await search('q=tesouro%20ipca%2B');

        expect(crypto[0]).toMatchObject({
            symbol: 'BTC',
            market: 'CRYPTO',
            currency: 'USD',
            quantityDecimals: 8,
            suggestedClassKey: 'cripto'
        });
        expect(tesouro.map((item: ItemBody) => item.symbol)).toContain('Tesouro IPCA+ 2035');
        expect(tesouro.find((item: ItemBody) => item.symbol === 'Tesouro IPCA+ 2035')).toMatchObject({
            maturityDate: '2035-05-15',
            suggestedClassKey: 'rf_ipca',
            quantityDecimals: 2
        });
    });

    it('lists the popular assets of the group when q is empty', async () => {
        const found: ItemBody[] = await search('group=fii');
        const symbols: string[] = found.map((item: ItemBody) => item.symbol);

        expect(symbols[0]).toBe('HGLG11');
        expect(symbols).toContain('KNRI11');
        expect(found.every((item: ItemBody) => item.typeGroup === 'fii')).toBe(true);
    });

    it('leaves the class null for an ETF without default class', async () => {
        const found: ItemBody[] = await search('q=gold11');

        expect(found[0]).toMatchObject({ symbol: 'GOLD11', suggestedClassKey: null });
    });

    it('caps the result size and validates the limit', async () => {
        expect(await search('limit=2&group=acoes_br')).toHaveLength(2);
        expect((await get('/catalog/assets?limit=31')).status).toBe(400);
        expect((await get('/catalog/assets?group=outro')).status).toBe(400);
        expect((await get(`/catalog/assets?q=${'a'.repeat(61)}`)).status).toBe(400);
    });

    it('treats percent and underscore as plain characters', async () => {
        expect(await search('q=%25')).toEqual([]);
        expect(await search('q=_')).toEqual([]);
    });

    it('hides delisted assets from the search but still resolves them by id', async () => {
        const before: ItemBody[] = await search('q=taee11');
        expect(before).toHaveLength(1);
        await pg.query(`UPDATE "Assets" SET status = 'delisted' WHERE "externalId" = 'TAEE11'`);

        expect(await search('q=taee11')).toEqual([]);
        const byId: Response = await get(`/catalog/assets/${before[0]?.id ?? ''}`);
        expect(byId.status).toBe(200);
        await pg.query(`UPDATE "Assets" SET status = 'active' WHERE "externalId" = 'TAEE11'`);
    });

    it('returns one asset by id and catalog.asset_not_found otherwise', async () => {
        const [first] = await search('q=voo');
        const ok: Response = await get(`/catalog/assets/${first?.id ?? ''}`);
        const missing: Response = await get('/catalog/assets/0199c3a0-0000-7000-8000-000000000000');
        const invalid: Response = await get('/catalog/assets/nao-e-uuid');

        expect(ok.status).toBe(200);
        expect(((await ok.json()) as ItemBody).symbol).toBe('VOO');
        expect(missing.status).toBe(404);
        expect(((await missing.json()) as ProblemBody).type).toBe('catalog.asset_not_found');
        expect(invalid.status).toBe(400);
    });

    it('answers 401 without a session', async () => {
        const search401: Response = await get('/catalog/assets?q=itub', null);
        const byId401: Response = await get('/catalog/assets/0199c3a0-0000-7000-8000-000000000000', null);

        expect(search401.status).toBe(401);
        expect(((await search401.json()) as ProblemBody).type).toBe('identity.unauthorized');
        expect(byId401.status).toBe(401);
    });

    it('rate limits searches at 60 per minute per company', async () => {
        await pg.query(`DELETE FROM "Throttles" WHERE key = $1`, [`catalog-search:${companyId}`]);
        const statuses: number[] = [];
        for (let call = 0; call < 62; call += 1) {
            statuses.push((await get('/catalog/assets?q=itub')).status);
        }

        expect(statuses.slice(0, 60).every((status: number) => status === 200)).toBe(true);
        expect(statuses.slice(60)).toEqual([429, 429]);
        const other: { token: string } = await signUp();
        expect((await get('/catalog/assets?q=itub', other.token)).status).toBe(200);
    });
});
