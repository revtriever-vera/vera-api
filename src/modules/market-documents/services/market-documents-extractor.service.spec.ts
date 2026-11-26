import { describe, expect, it, vi } from 'vitest';
import { parseMarketDocumentsConfig } from '../config/market-documents.config';
import { PendingDocument } from '../domain/market-documents.types';
import { MarketDocumentsExtractorService } from './market-documents-extractor.service';

function pending(id: string, attempts: number = 0): PendingDocument {
    return { id, source: 'cvm_ipe', url: `https://www.rad.cvm.gov.br/doc/${id}`, attempts };
}

function rig(documents: readonly PendingDocument[], read: ReturnType<typeof vi.fn>) {
    const domain = {
        findPending: vi.fn().mockResolvedValue(documents),
        markExtracted: vi.fn().mockResolvedValue(true),
        markSkipped: vi.fn().mockResolvedValue(true),
        recordFailedAttempt: vi.fn().mockResolvedValue(true)
    };
    const metrics = { extracted: vi.fn() };
    const logs = { documentFailed: vi.fn() };
    const service: MarketDocumentsExtractorService = new MarketDocumentsExtractorService(
        parseMarketDocumentsConfig({ MARKET_DOC_EXTRACT_BATCH: '5', MARKET_DOC_MAX_ATTEMPTS: '3' }),
        domain as never,
        { read } as never,
        metrics as never,
        logs as never
    );
    return { service, domain, metrics, logs };
}

describe('MarketDocumentsExtractorService', () => {
    it('stores the text and the hash of a readable document', async () => {
        const read: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ kind: 'text', text: 'conteudo', textHash: 'abc' });
        const { service, domain, metrics } = rig([pending('a')], read);

        await expect(service.extractPending()).resolves.toBe(1);

        expect(domain.findPending).toHaveBeenCalledWith(5);
        expect(domain.markExtracted).toHaveBeenCalledWith('a', 'conteudo', 'abc');
        expect(metrics.extracted).toHaveBeenCalledWith('extracted');
    });

    it('skips a scanned document with the reason', async () => {
        const read: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ kind: 'skipped', reason: 'scanned' });
        const { service, domain, metrics } = rig([pending('a')], read);

        await expect(service.extractPending()).resolves.toBe(0);

        expect(domain.markSkipped).toHaveBeenCalledWith('a', 'scanned');
        expect(metrics.extracted).toHaveBeenCalledWith('scanned');
    });

    it('counts a failed attempt and keeps going with the next document', async () => {
        const read: ReturnType<typeof vi.fn> = vi
            .fn()
            .mockRejectedValueOnce(new Error('timeout'))
            .mockResolvedValue({ kind: 'text', text: 't', textHash: 'h' });
        const { service, domain, metrics, logs } = rig([pending('a', 0), pending('b')], read);

        await expect(service.extractPending()).resolves.toBe(1);

        expect(domain.recordFailedAttempt).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 3);
        expect(logs.documentFailed).toHaveBeenCalledWith('a', 1);
        expect(metrics.extracted).toHaveBeenCalledWith('retry');
        expect(domain.markExtracted).toHaveBeenCalledWith('b', 't', 'h');
    });

    it('reports a document as failed on the last attempt', async () => {
        const read: ReturnType<typeof vi.fn> = vi.fn().mockRejectedValue(new Error('timeout'));
        const { service, metrics } = rig([pending('a', 2)], read);

        await service.extractPending();

        expect(metrics.extracted).toHaveBeenCalledWith('failed');
    });

    it('does nothing when no document is pending', async () => {
        const read: ReturnType<typeof vi.fn> = vi.fn();
        const { service } = rig([], read);

        await expect(service.extractPending()).resolves.toBe(0);
        expect(read).not.toHaveBeenCalled();
    });
});
