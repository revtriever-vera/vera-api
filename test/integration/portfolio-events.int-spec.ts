import { INestApplication, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { AppModule } from '../../src/app.module';
import { QueuePublisherPort } from '../../src/core/queue/queue.types';
import { CatalogSyncApplication } from '../../src/modules/catalog/application/catalog-sync.application';
import { HeldAssetsPort } from '../../src/modules/market-data/services/held-assets.port';
import { ProviderHttpService } from '../../src/modules/market-data/services/provider-http.service';
import { PortfolioEventsBatchApplication } from '../../src/modules/portfolio-events/application/portfolio-events-batch.application';
import { PortfolioEventsSweepApplication } from '../../src/modules/portfolio-events/application/portfolio-events-sweep.application';
import { AssetIssuerLinkDomain } from '../../src/modules/portfolio-events/domain/asset-issuer-link.domain';
import { PortfolioEventsReaderService } from '../../src/modules/portfolio-events/services/portfolio-events-reader.service';
import { createIsolatedDatabase, IsolatedDatabase } from './support/isolated-database';
import { CapturingPublisher, isolateRedisForWorker } from './support/queue';

const CNPJ: string = '11728688000147';
const NOTICE_TYPE: string = 'Aviso aos Cotistas - Estruturado';

function notice(income: string): string {
    const xml: string = `<DadosEconomicoFinanceiros>
        <Provento><TipoProvento>Rendimento</TipoProvento><DataBase>2026-10-30</DataBase><DataPagamento>2026-11-14</DataPagamento><ValorProventoCota>${income}</ValorProventoCota></Provento>
        <Provento><TipoProvento>Amortização</TipoProvento><DataBase>2026-10-30</DataBase><DataPagamento>2026-11-14</DataPagamento><ValorProventoCota>0,25</ValorProventoCota></Provento>
    </DadosEconomicoFinanceiros>`;
    return Buffer.from(xml, 'utf8').toString('base64');
}

class HeldForTest extends HeldAssetsPort {
    public static ids: string[] = [];

    public listHeldAssetIdsAcrossTenants(): Promise<readonly string[]> {
        return Promise.resolve(HeldForTest.ids);
    }
}

@Module({ providers: [HeldForTest] })
class TestHeldModule {}

describe('portfolio events', () => {
    const publisher: CapturingPublisher = new CapturingPublisher();
    const requestedUrls: string[] = [];
    let incomeValue: string = '1,10';
    let documentId: number = 100;
    let app: INestApplication;
    let isolated: IsolatedDatabase;
    let pg: Client;
    let held: string;
    let notHeld: string;

    const http: Pick<ProviderHttpService, 'getJson'> = {
        getJson: ({ url }: { url: string }): Promise<unknown> => {
            requestedUrls.push(url);
            if (url.includes('pesquisarGerenciadorDocumentosDados')) {
                return Promise.resolve({ data: [{ id: documentId, versao: 0, status: 'AC', tipoDocumento: NOTICE_TYPE }] });
            }
            return Promise.resolve(notice(incomeValue));
        }
    };

    beforeAll(async () => {
        isolated = await createIsolatedDatabase('portfolio_events');
        process.env['DATABASE_URL'] = isolated.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';
        process.env['CATALOG_DRIVER'] = 'mock';
        process.env['MARKET_DATA_DRIVER'] = 'mock';
        process.env['PORTFOLIO_EVENTS_FNET_ENABLED'] = 'true';
        process.env['PORTFOLIO_EVENTS_REQUEST_SPACING_MS'] = '0';
        const testing: TestingModule = await Test.createTestingModule({ imports: [AppModule, TestHeldModule] })
            .overrideProvider(QueuePublisherPort)
            .useValue(publisher)
            .overrideProvider(ProviderHttpService)
            .useValue(http)
            .compile();
        app = testing.createNestApplication();
        await app.init();
        pg = new Client({ connectionString: isolated.url });
        await pg.connect();
        await app.get(CatalogSyncApplication, { strict: false }).syncAllNow();
        const rows = await pg.query<{ id: string; externalId: string }>(
            `SELECT id, "externalId" FROM "Assets" WHERE "externalId" IN ('HGLG11', 'KNRI11', 'ITUB4')`
        );
        const idOf = (externalId: string): string => rows.rows.find((row) => row.externalId === externalId)?.id ?? '';
        held = idOf('HGLG11');
        notHeld = idOf('KNRI11');
        const links: AssetIssuerLinkDomain = app.get(AssetIssuerLinkDomain, { strict: false });
        await links.saveMany([
            { assetId: held, issuerKind: 'fund', cnpj: CNPJ, cvmCode: null, source: 'cvm_inf_mensal_fii' },
            { assetId: notHeld, issuerKind: 'fund', cnpj: '33000167000101', cvmCode: null, source: 'cvm_inf_mensal_fii' },
            { assetId: idOf('ITUB4'), issuerKind: 'company', cnpj: 'sem-cnpj', cvmCode: null, source: 'cvm_fca' }
        ]);
        HeldForTest.ids = [held, idOf('ITUB4')];
    });

    afterAll(async () => {
        await pg.end();
        await app.close();
        await isolated.drop();
    });

    async function events(): Promise<{ kind: string; amountPerUnit: string; externalKey: string }[]> {
        const result = await pg.query<{ kind: string; amountPerUnit: string; externalKey: string }>(
            `SELECT kind, "amountPerUnit"::text AS "amountPerUnit", "externalKey" FROM "PortfolioEvents" ORDER BY kind`
        );
        return result.rows;
    }

    it('the application boots with the module and a link only exists with an official CNPJ', async () => {
        const links = await pg.query<{ assetId: string }>('SELECT "assetId" FROM "AssetIssuerLinks" ORDER BY "assetId"');

        expect(links.rows).toHaveLength(2);
        expect(app.get(PortfolioEventsReaderService, { strict: false })).toBeDefined();
    });

    it('the sweep queues only the held fund, and running it twice on the same day repeats the same job', async () => {
        const sweep = app.get(PortfolioEventsSweepApplication, { strict: false });

        await sweep.handleTick();
        await sweep.handleTick();

        const batches = publisher.ofType('portfolio-events.batch.requested');
        expect(batches).toHaveLength(2);
        expect(batches[0]?.payload).toEqual({ source: 'fnet', assetIds: [held] });
        expect(batches[0]?.options?.jobId).toBe(batches[1]?.options?.jobId);
        expect(requestedUrls).toHaveLength(0);
    });

    it('a batch stores income and amortization once, even when run again, and only asks about the linked fund', async () => {
        const batch = app.get(PortfolioEventsBatchApplication, { strict: false });

        await batch.handleBatch({ source: 'fnet', assetIds: [held] });
        await batch.handleBatch({ source: 'fnet', assetIds: [held] });

        expect(await events()).toEqual([
            { kind: 'amortization', amountPerUnit: '0.25000000', externalKey: `${CNPJ}:amortization:2026-10-30` },
            { kind: 'fii_income', amountPerUnit: '1.10000000', externalKey: `${CNPJ}:fii_income:2026-10-30` }
        ]);
        expect(requestedUrls.every((url) => url.includes(`cnpjFundo=${CNPJ}`) || url.includes('downloadDocumento'))).toBe(true);
    });

    it('a rectified notice updates the stored event instead of creating another one', async () => {
        const batch = app.get(PortfolioEventsBatchApplication, { strict: false });
        incomeValue = '1,12';
        documentId = 101;

        await batch.handleBatch({ source: 'fnet', assetIds: [held] });

        const stored = await events();
        expect(stored).toHaveLength(2);
        expect(stored.find((event) => event.kind === 'fii_income')?.amountPerUnit).toBe('1.12000000');
    });

    it('the reader returns the events of the asked assets inside the window', async () => {
        const reader = app.get(PortfolioEventsReaderService, { strict: false });

        const inside = await reader.forAssets([held, notHeld], { from: '2026-10-01', to: '2026-11-30' });
        const outside = await reader.forAssets([held], { from: '2027-01-01', to: '2027-01-31' });
        const other = await reader.forAssets([notHeld], { from: '2026-10-01', to: '2026-11-30' });

        expect(inside.map((event) => [event.assetId, event.kind, event.exDate, event.paymentDate, event.amountPerUnit])).toEqual([
            [held, 'amortization', '2026-10-30', '2026-11-14', '0.25000000'],
            [held, 'fii_income', '2026-10-30', '2026-11-14', '1.12000000']
        ]);
        expect(outside).toEqual([]);
        expect(other).toEqual([]);
    });
});
