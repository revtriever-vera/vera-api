import { INestApplication, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, inject } from 'vitest';
import { AppModule } from '../../src/app.module';
import { QueuePublisherPort } from '../../src/core/queue/queue.types';
import { CatalogSyncApplication } from '../../src/modules/catalog/application/catalog-sync.application';
import { CvmIpeReaderService, IpeDocument } from '../../src/modules/catalog/services/cvm-ipe-reader.service';
import { CvmPeriodicReaderService, PeriodicDocument, PeriodicKind } from '../../src/modules/catalog/services/cvm-periodic-reader.service';
import { HeldAssetsPort } from '../../src/modules/market-data/services/held-assets.port';
import { ProviderHttpService } from '../../src/modules/market-data/services/provider-http.service';
import { MarketDocumentsSweepApplication } from '../../src/modules/market-documents/application/market-documents-sweep.application';
import { MarketDocumentDomain } from '../../src/modules/market-documents/domain/market-document.domain';
import { blankPdf, pdfOfText } from '../../src/modules/market-documents/drivers/fixtures/document-pdf';
import { AssetIssuerLinkDomain } from '../../src/modules/portfolio-events/domain/asset-issuer-link.domain';
import { createIsolatedDatabase, IsolatedDatabase } from './support/isolated-database';
import { CapturingPublisher, isolateRedisForWorker } from './support/queue';

const CNPJ: string = '60872504000123';
const FUND_CNPJ: string = '11728688000147';
const RAD: string = 'https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?numSequencia=';

function ipe(sequence: number, overrides: Partial<IpeDocument> = {}): IpeDocument {
    return {
        cnpj: CNPJ,
        category: 'Fato Relevante',
        type: '',
        species: '',
        subject: 'Fato relevante',
        referenceDate: '2026-11-20',
        deliveryDate: '2026-11-20',
        version: 1,
        sequence,
        url: `${RAD}${String(sequence)}`,
        ...overrides
    };
}

interface StoredDocument {
    source: string;
    externalId: string;
    status: string;
    skipReason: string | null;
    hasText: boolean;
    hash: string | null;
    assetIds: string[];
}

class HeldForTest extends HeldAssetsPort {
    public static ids: string[] = [];

    public listHeldAssetIdsAcrossTenants(): Promise<readonly string[]> {
        return Promise.resolve(HeldForTest.ids);
    }
}

@Module({ providers: [HeldForTest] })
class TestHeldModule {}

describe('market documents', () => {
    const downloads: string[] = [];
    let ipeDocuments: IpeDocument[] = [];
    let ipeDown: boolean = false;
    let downloadFails: boolean = false;
    let pdfs: Map<string, Uint8Array>;
    let app: INestApplication;
    let isolated: IsolatedDatabase;
    let pg: Client;
    let first: string;
    let second: string;
    let fund: string;

    const itr: PeriodicDocument = {
        cnpj: CNPJ,
        kind: 'ITR',
        referenceDate: '2026-09-30',
        deliveryDate: '2026-11-12',
        version: 1,
        documentId: '777',
        url: 'http://www.rad.cvm.gov.br/ENETCONSULTA/frmDownloadDocumento.aspx?NumeroSequencialDocumento=777'
    };

    const ipeReader: Pick<CvmIpeReaderService, 'documents'> = {
        documents: (): Promise<readonly IpeDocument[]> => (ipeDown ? Promise.reject(new Error('ipe down')) : Promise.resolve(ipeDocuments))
    };
    const periodicReader: Pick<CvmPeriodicReaderService, 'documents'> = {
        documents: (kind: PeriodicKind): Promise<readonly PeriodicDocument[]> => Promise.resolve(kind === 'ITR' ? [itr] : [])
    };
    const http: Pick<ProviderHttpService, 'getBytes'> = {
        getBytes: ({ url }: { url: string }): Promise<Uint8Array> => {
            downloads.push(url);
            const bytes: Uint8Array | undefined = pdfs.get(url);
            return downloadFails || bytes === undefined ? Promise.reject(new Error('unreachable')) : Promise.resolve(bytes);
        }
    };

    beforeAll(async () => {
        isolated = await createIsolatedDatabase('market_documents');
        process.env['DATABASE_URL'] = isolated.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';
        process.env['CATALOG_DRIVER'] = 'mock';
        process.env['MARKET_DATA_DRIVER'] = 'mock';
        process.env['MARKET_DOC_CVM_IPE_ENABLED'] = 'true';
        process.env['MARKET_DOC_CVM_ITR_ENABLED'] = 'true';
        process.env['MARKET_DOC_REQUEST_SPACING_MS'] = '0';
        const testing: TestingModule = await Test.createTestingModule({ imports: [AppModule, TestHeldModule] })
            .overrideProvider(QueuePublisherPort)
            .useValue(new CapturingPublisher())
            .overrideProvider(CvmIpeReaderService)
            .useValue(ipeReader)
            .overrideProvider(CvmPeriodicReaderService)
            .useValue(periodicReader)
            .overrideProvider(ProviderHttpService)
            .useValue(http)
            .compile();
        app = testing.createNestApplication();
        await app.init();
        pg = new Client({ connectionString: isolated.url });
        await pg.connect();
        await app.get(CatalogSyncApplication, { strict: false }).syncAllNow();
        const rows = await pg.query<{ id: string; externalId: string }>(
            `SELECT id, "externalId" FROM "Assets" WHERE "externalId" IN ('ITUB4', 'PETR4', 'HGLG11')`
        );
        const idOf = (externalId: string): string => rows.rows.find((row) => row.externalId === externalId)?.id ?? '';
        first = idOf('ITUB4');
        second = idOf('PETR4');
        fund = idOf('HGLG11');
        await app.get(AssetIssuerLinkDomain, { strict: false }).saveMany([
            { assetId: first, issuerKind: 'company', cnpj: CNPJ, cvmCode: null, source: 'cvm_fca', assetClass: 'PN' },
            { assetId: second, issuerKind: 'company', cnpj: CNPJ, cvmCode: null, source: 'cvm_fca', assetClass: 'ON' },
            { assetId: fund, issuerKind: 'fund', cnpj: FUND_CNPJ, cvmCode: null, source: 'cvm_inf_mensal_fii' }
        ]);
        HeldForTest.ids = [first, second, fund];
    });

    afterAll(async () => {
        await pg.end();
        await app.close();
        await isolated.drop();
    });

    beforeEach(async () => {
        downloads.length = 0;
        ipeDown = false;
        downloadFails = false;
        await pg.query('DELETE FROM "MarketDocuments"');
        ipeDocuments = [
            ipe(1),
            ipe(2, { category: 'Valores Mobiliários negociados e detidos (art. 11 da Instr. CVM nº 358)', subject: '' }),
            ipe(3, { category: 'Aviso aos Acionistas', subject: 'Documento digitalizado' }),
            ipe(4, { category: 'Reunião da Administração' })
        ];
        pdfs = new Map<string, Uint8Array>([
            [`${RAD}1`, await pdfOfText('FATO RELEVANTE\nA Companhia comunica')],
            [`${RAD}3`, await blankPdf()]
        ]);
    });

    async function stored(): Promise<StoredDocument[]> {
        const result = await pg.query<StoredDocument>(
            `SELECT source, "externalId", status, "skipReason", ("extractedText" IS NOT NULL) AS "hasText", "textHash" AS hash, "assetIds"
             FROM "MarketDocuments" ORDER BY source, "externalId"`
        );
        return result.rows;
    }

    it('collects the documents of the issuers held, once per issuer, with every asset that holds it', async () => {
        await app.get(MarketDocumentsSweepApplication, { strict: false }).handleTick();

        const rows = await stored();
        expect(rows.map((row) => `${row.source}:${row.externalId}:${row.status}`)).toEqual([
            'cvm_ipe:1:1:extracted',
            'cvm_ipe:2:1:skipped',
            'cvm_ipe:3:1:skipped',
            'cvm_itr:ITR:777:skipped'
        ]);
        expect(rows[0]?.assetIds.sort()).toEqual([first, second].sort());
        expect(rows[0]).toMatchObject({ hasText: true });
        expect(rows[0]?.hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('does not download a routine category, a package of financial statements or a category it does not watch', async () => {
        await app.get(MarketDocumentsSweepApplication, { strict: false }).handleTick();

        expect(downloads.sort()).toEqual([`${RAD}1`, `${RAD}3`]);
        const rows = await stored();
        expect(rows.find((row) => row.externalId === '2:1')).toMatchObject({ skipReason: 'routine_category', hasText: false });
        expect(rows.find((row) => row.externalId === 'ITR:777')).toMatchObject({ skipReason: 'financial_package' });
        expect(rows.find((row) => row.externalId === '3:1')).toMatchObject({ skipReason: 'scanned' });
        expect(rows.some((row) => row.externalId === '4:1')).toBe(false);
    });

    it('a repeated sweep neither duplicates a document nor downloads it again', async () => {
        const sweep = app.get(MarketDocumentsSweepApplication, { strict: false });

        await sweep.handleTick();
        const before = await stored();
        downloads.length = 0;
        await sweep.handleTick();

        expect(await stored()).toEqual(before);
        expect(downloads).toEqual([]);
    });

    it('a source that is down does not stop the others', async () => {
        ipeDown = true;

        await app.get(MarketDocumentsSweepApplication, { strict: false }).handleTick();

        expect((await stored()).map((row) => row.source)).toEqual(['cvm_itr']);
    });

    it('a document that cannot be downloaded stays pending until the attempts run out', async () => {
        downloadFails = true;
        const sweep = app.get(MarketDocumentsSweepApplication, { strict: false });

        await sweep.handleTick();
        expect((await stored()).find((row) => row.externalId === '1:1')?.status).toBe('pending');
        await sweep.handleTick();
        await sweep.handleTick();

        expect((await stored()).find((row) => row.externalId === '1:1')).toMatchObject({ status: 'failed', skipReason: 'unreachable' });
    });

    it('a document that is summarized loses the text and keeps the hash, and an old one is deleted', async () => {
        const sweep = app.get(MarketDocumentsSweepApplication, { strict: false });
        await sweep.handleTick();
        await pg.query(
            `INSERT INTO "MarketDocuments" (id, source, "externalId", category, title, "publishedAt", url)
             VALUES ('0199a000-0000-7000-8000-0000000000aa', 'cvm_ipe', 'old:1', 'relevant_fact', 'Antigo', now() - interval '400 days', 'https://www.rad.cvm.gov.br/x')`
        );
        const id: string =
            (await pg.query<{ id: string }>(`SELECT id FROM "MarketDocuments" WHERE "externalId" = '1:1'`)).rows[0]?.id ?? '';

        await app.get(MarketDocumentDomain, { strict: false }).markSummarized(id);
        await sweep.handleTick();

        const rows = await stored();
        expect(rows.find((row) => row.externalId === '1:1')).toMatchObject({ status: 'summarized', hasText: false });
        expect(rows.find((row) => row.externalId === '1:1')?.hash).toMatch(/^[0-9a-f]{64}$/);
        expect(rows.some((row) => row.externalId === 'old:1')).toBe(false);
    });

    it('a document of a fund is not asked of the company sources', async () => {
        await app.get(MarketDocumentsSweepApplication, { strict: false }).handleTick();

        expect((await stored()).every((row) => row.source !== 'b3_fnet')).toBe(true);
    });
});
