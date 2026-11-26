import { describe, expect, it, vi } from 'vitest';
import { parseMarketDocumentsConfig } from '../config/market-documents.config';
import { MarketDocumentsSweepApplication } from './market-documents-sweep.application';

const link = (assetId: string, cnpj: string, issuerKind: 'company' | 'fund' = 'company') => ({
    assetId,
    issuerKind,
    cnpj,
    assetClass: null
});

function rig(held: string[], links: ReturnType<typeof link>[]) {
    const collector = { collect: vi.fn().mockResolvedValue(4) };
    const extractor = { extractPending: vi.fn().mockResolvedValue(2) };
    const documents = { applyRetention: vi.fn().mockResolvedValue(1) };
    const metrics = { unlinkedAssets: vi.fn() };
    const logs = { sweepFinished: vi.fn(), retentionApplied: vi.fn() };
    const application: MarketDocumentsSweepApplication = new MarketDocumentsSweepApplication(
        parseMarketDocumentsConfig({ MARKET_DOC_RETENTION_DAYS: '365' }),
        { listHeldAssetIds: vi.fn().mockResolvedValue(held) } as never,
        { forAssets: vi.fn().mockResolvedValue(links) } as never,
        collector as never,
        extractor as never,
        documents as never,
        metrics as never,
        logs as never
    );
    return { application, collector, extractor, documents, metrics, logs };
}

describe('MarketDocumentsSweepApplication', () => {
    it('groups the held assets by issuer and runs collection, extraction and retention', async () => {
        const { application, collector, extractor, documents, metrics, logs } = rig(
            ['a1', 'a2', 'a3', 'a4'],
            [link('a1', '01083200000118'), link('a2', '01083200000118'), link('a3', '11728688000147', 'fund')]
        );

        await expect(application.handleTick()).resolves.toEqual({ issuers: 2, collected: 4, extracted: 2 });

        expect(collector.collect).toHaveBeenCalledWith([
            { cnpj: '01083200000118', issuerKind: 'company', assetIds: ['a1', 'a2'] },
            { cnpj: '11728688000147', issuerKind: 'fund', assetIds: ['a3'] }
        ]);
        expect(extractor.extractPending).toHaveBeenCalledTimes(1);
        expect(documents.applyRetention).toHaveBeenCalledWith(365);
        expect(metrics.unlinkedAssets).toHaveBeenCalledWith(1);
        expect(logs.sweepFinished).toHaveBeenCalledWith(4, 2, 4, 2);
        expect(logs.retentionApplied).toHaveBeenCalledWith(1);
    });

    it('ignores a link whose CNPJ is not 14 digits', async () => {
        const { application, collector } = rig(['a1'], [link('a1', '123')]);

        await application.handleTick();

        expect(collector.collect).toHaveBeenCalledWith([]);
    });
});
