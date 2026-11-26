import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, inject } from 'vitest';
import { AppModule } from '../../src/app.module';
import { MockLlmDriver } from '../../src/core/llm/drivers/mock-llm.driver';
import { DEFAULT_MODEL_ID } from '../../src/core/llm/config/llm.config';
import { QueuePublisherPort } from '../../src/core/queue/queue.types';
import { MarketDocumentSummarizerService } from '../../src/modules/market-documents/services/market-document-summarizer.service';
import { createIsolatedDatabase, IsolatedDatabase } from './support/isolated-database';
import { CapturingPublisher, isolateRedisForWorker } from './support/queue';

const TEXT: string = 'A Companhia informa lucro líquido de R$ 500 milhões no trimestre.';
const GOOD: string = JSON.stringify({
    summary: 'A Companhia teve lucro líquido de R$ 500 milhões no trimestre.',
    kind: 'result',
    relevance: 2,
    discard: false,
    numbers: ['R$ 500 milhões']
});
const CAP_MICROS: number = 3_000_000;
const PRICE_TABLE: string = JSON.stringify({ [DEFAULT_MODEL_ID]: { input: 100, output: 100, cacheRead: 0 } });

describe('market document summaries', () => {
    let app: INestApplication;
    let isolated: IsolatedDatabase;
    let pg: Client;
    let mock: MockLlmDriver;
    let service: MarketDocumentSummarizerService;

    beforeAll(async () => {
        isolated = await createIsolatedDatabase('market_document_summaries');
        process.env['DATABASE_URL'] = isolated.url;
        await isolateRedisForWorker(inject('redisNode'));
        process.env['NODE_ENV'] = 'test';
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';
        process.env['CATALOG_DRIVER'] = 'mock';
        process.env['MARKET_DATA_DRIVER'] = 'mock';
        process.env['LLM_DRIVER'] = 'mock';
        process.env['LLM_PRICE_TABLE'] = PRICE_TABLE;
        process.env['MARKET_DOCS_DAILY_CAP_MICROS'] = String(CAP_MICROS);
        const testing: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(QueuePublisherPort)
            .useValue(new CapturingPublisher())
            .compile();
        app = testing.createNestApplication();
        await app.init();
        pg = new Client({ connectionString: isolated.url });
        await pg.connect();
        mock = app.get(MockLlmDriver, { strict: false });
        service = app.get(MarketDocumentSummarizerService, { strict: false });
    });

    afterAll(async () => {
        delete process.env['LLM_DRIVER'];
        delete process.env['LLM_PRICE_TABLE'];
        delete process.env['MARKET_DOCS_DAILY_CAP_MICROS'];
        await pg.end();
        await app.close();
        await isolated.drop();
    });

    beforeEach(async () => {
        await pg.query('DELETE FROM "MarketDocumentSummaries"');
        await pg.query('DELETE FROM "MarketDocuments"');
        await pg.query('DELETE FROM "LlmCalls"');
    });

    async function extracted(externalId: string, text: string = TEXT): Promise<string> {
        const id: string = crypto.randomUUID();
        await pg.query(
            `INSERT INTO "MarketDocuments" (id, source, "externalId", category, title, "publishedAt", url, status, "extractedText")
             VALUES ($1, 'cvm_ipe', $2, 'quarterly_results', 'ITR', now(), 'https://www.rad.cvm.gov.br/x', 'extracted', $3)`,
            [id, externalId, text]
        );
        return id;
    }

    async function statusOf(id: string): Promise<{ status: string; hasText: boolean }> {
        const result = await pg.query<{ status: string; hasText: boolean }>(
            `SELECT status, ("extractedText" IS NOT NULL) AS "hasText" FROM "MarketDocuments" WHERE id = $1`,
            [id]
        );
        return result.rows[0] ?? { status: 'missing', hasText: false };
    }

    it('summarizes once for every account: the call has no company, the summary is stored and the text is dropped', async () => {
        const id: string = await extracted('s1');
        mock.enqueue(GOOD);

        await expect(service.summarizePending()).resolves.toBe(1);

        const summaries = await pg.query(
            `SELECT "documentId", locale, "promptVersion", kind, relevance, discard, "llmCallId" FROM "MarketDocumentSummaries"`
        );
        expect(summaries.rows).toHaveLength(1);
        expect(summaries.rows[0]).toMatchObject({
            documentId: id,
            locale: 'pt-BR',
            promptVersion: 'v1',
            kind: 'result',
            relevance: 2,
            discard: false
        });
        const calls = await pg.query(`SELECT "companyId", feature, task, outcome FROM "LlmCalls"`);
        expect(calls.rows).toEqual([{ companyId: null, feature: 'market_docs', task: 'market_document_summary', outcome: 'answered' }]);
        expect(await statusOf(id)).toEqual({ status: 'summarized', hasText: false });
    });

    it('a second sweep does not call the model again for a document that already has its summary', async () => {
        const id: string = await extracted('s2');
        mock.enqueue(GOOD);
        await service.summarizePending();
        await pg.query(`UPDATE "MarketDocuments" SET status = 'extracted', "extractedText" = $2 WHERE id = $1`, [id, TEXT]);

        await service.summarizePending();

        const calls = await pg.query(`SELECT 1 FROM "LlmCalls"`);
        expect(calls.rows).toHaveLength(1);
        expect(await statusOf(id)).toEqual({ status: 'summarized', hasText: false });
    });

    it('the daily platform cap stops the batch: the document keeps its title and link, without a summary, and stays queued', async () => {
        const ids: string[] = [await extracted('c1'), await extracted('c2'), await extracted('c3')];
        await pg.query(
            `INSERT INTO "LlmCalls" (id, "companyId", task, feature, driver, "modelId", "costMicros", "latencyMs", attempts, outcome, "requestHash")
             VALUES ($1, NULL, 'market_document_summary', 'market_docs', 'mock', 'm', $2, 1, 1, 'answered', 'h')`,
            [crypto.randomUUID(), CAP_MICROS]
        );

        await expect(service.summarizePending()).resolves.toBe(0);

        const summaries = await pg.query(`SELECT 1 FROM "MarketDocumentSummaries"`);
        expect(summaries.rows).toHaveLength(0);
        for (const id of ids) {
            expect((await statusOf(id)).status).toBe('extracted');
        }
        const refused = await pg.query(`SELECT outcome FROM "LlmCalls" WHERE outcome = 'cap_reached'`);
        expect(refused.rows).toHaveLength(1);
    });

    it('an invented number is reproved twice and the document becomes failed, with the title and the link', async () => {
        const id: string = await extracted('i1');
        const invented: string = GOOD.replace('500', '900');
        mock.enqueue(invented);
        mock.enqueue(invented);

        await service.summarizePending();

        expect(await statusOf(id)).toEqual({ status: 'failed', hasText: false });
        const summaries = await pg.query(`SELECT 1 FROM "MarketDocumentSummaries"`);
        expect(summaries.rows).toHaveLength(0);
    });
});
