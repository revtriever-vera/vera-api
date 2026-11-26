import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketDocumentDomain } from './market-document.domain';
import { MarketDocumentWrite } from './market-documents.types';

function write(overrides: Partial<MarketDocumentWrite> = {}): MarketDocumentWrite {
    return {
        source: 'cvm_ipe',
        externalId: '10:1',
        issuerCnpj: '01083200000118',
        assetIds: ['a1'],
        category: 'relevant_fact',
        title: 'Fato',
        publishedAt: '2026-11-20T12:00:00Z',
        url: 'https://www.rad.cvm.gov.br/doc',
        status: 'pending',
        skipReason: null,
        ...overrides
    };
}

function rig() {
    const repository = {
        upsertMany: vi.fn().mockResolvedValue(undefined),
        findPending: vi.fn(),
        transitionPending: vi.fn().mockResolvedValue(true),
        transitionExtracted: vi.fn().mockResolvedValue(true),
        deleteOlderThan: vi.fn().mockResolvedValue(3)
    };
    return { repository, domain: new MarketDocumentDomain(repository as never) };
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-25T15:00:00Z'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('MarketDocumentDomain', () => {
    it('merges the assets of the same document before saving', async () => {
        const { domain, repository } = rig();

        await expect(domain.saveMany([write(), write({ assetIds: ['a2', 'a1'] }), write({ externalId: '11:1' })])).resolves.toBe(2);

        expect(repository.upsertMany).toHaveBeenCalledWith([write({ assetIds: ['a1', 'a2'] }), write({ externalId: '11:1' })]);
    });

    it('lists the pending documents with what the extraction needs', async () => {
        const { domain, repository } = rig();
        repository.findPending.mockResolvedValue([{ id: 'x', source: 'cvm_ipe', url: 'u', attempts: 1, title: 'ignored' }]);

        await expect(domain.findPending(5)).resolves.toEqual([{ id: 'x', source: 'cvm_ipe', url: 'u', attempts: 1 }]);
        expect(repository.findPending).toHaveBeenCalledWith(5);
    });

    it('moves a pending document to extracted with its text and hash', async () => {
        const { domain, repository } = rig();

        await domain.markExtracted('x', 'texto', 'hash');

        expect(repository.transitionPending).toHaveBeenCalledWith('x', {
            status: 'extracted',
            extractedText: 'texto',
            textHash: 'hash',
            skipReason: null
        });
    });

    it('moves a pending document to skipped with the reason', async () => {
        const { domain, repository } = rig();

        await domain.markSkipped('x', 'scanned');

        expect(repository.transitionPending).toHaveBeenCalledWith('x', { status: 'skipped', skipReason: 'scanned' });
    });

    it('counts a failed attempt and only fails the document on the last one', async () => {
        const { domain, repository } = rig();
        const document = { id: 'x', source: 'cvm_ipe' as const, url: 'u', attempts: 1 };

        await domain.recordFailedAttempt(document, 3);
        await domain.recordFailedAttempt({ ...document, attempts: 2 }, 3);

        expect(repository.transitionPending).toHaveBeenNthCalledWith(1, 'x', { attempts: 2 });
        expect(repository.transitionPending).toHaveBeenNthCalledWith(2, 'x', { attempts: 3, status: 'failed', skipReason: 'unreachable' });
    });

    it('drops the text when a document is summarized, keeping the hash', async () => {
        const { domain, repository } = rig();

        await domain.markSummarized('x');

        expect(repository.transitionExtracted).toHaveBeenCalledWith('x', { status: 'summarized', extractedText: null });
    });

    it('deletes what is older than the retention window', async () => {
        const { domain, repository } = rig();

        await expect(domain.applyRetention(365)).resolves.toBe(3);

        expect(repository.deleteOlderThan).toHaveBeenCalledWith(new Date('2025-11-25T15:00:00Z'));
    });
});
