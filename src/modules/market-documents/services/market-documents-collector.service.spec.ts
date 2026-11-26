import { describe, expect, it, vi } from 'vitest';
import { DocumentDraft, DocumentIssuer, DocumentSource } from '../domain/market-documents.types';
import { MarketDocumentSourcePort } from '../ports/market-document-source.port';
import { MarketDocumentsCollectorService } from './market-documents-collector.service';

const COMPANY: DocumentIssuer = { cnpj: '01083200000118', issuerKind: 'company', assetIds: ['asset-1', 'asset-2'] };
const OTHER: DocumentIssuer = { cnpj: '33000167000101', issuerKind: 'company', assetIds: ['asset-3'] };
const FUND: DocumentIssuer = { cnpj: '11728688000147', issuerKind: 'fund', assetIds: ['asset-4'] };

const DRAFT: DocumentDraft = {
    externalId: '10:1',
    category: 'relevant_fact',
    title: 'Fato',
    publishedAt: '2026-11-20T12:00:00Z',
    url: 'https://www.rad.cvm.gov.br/doc',
    status: 'pending',
    skipReason: null
};

function port(source: DocumentSource, kind: DocumentIssuer['issuerKind'], fetchFor: ReturnType<typeof vi.fn>): MarketDocumentSourcePort {
    return { source, handles: (issuer: DocumentIssuer): boolean => issuer.issuerKind === kind, fetchFor };
}

function rig(sources: readonly MarketDocumentSourcePort[]) {
    const saveMany: ReturnType<typeof vi.fn> = vi.fn((documents: readonly unknown[]): Promise<number> => Promise.resolve(documents.length));
    const metrics = { collected: vi.fn(), sourceFailed: vi.fn() };
    const logs = { sourceFailed: vi.fn() };
    const service: MarketDocumentsCollectorService = new MarketDocumentsCollectorService(
        { enabled: (): readonly MarketDocumentSourcePort[] => sources } as never,
        { saveMany } as never,
        metrics as never,
        logs as never
    );
    return { service, saveMany, metrics, logs };
}

describe('MarketDocumentsCollectorService', () => {
    it('stores the drafts of each issuer with the source, the CNPJ and the assets that hold it', async () => {
        const fetchFor: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([DRAFT]);
        const { service, saveMany, metrics } = rig([port('cvm_ipe', 'company', fetchFor)]);

        await expect(service.collect([COMPANY, FUND])).resolves.toBe(1);

        expect(fetchFor).toHaveBeenCalledTimes(1);
        expect(saveMany).toHaveBeenCalledWith([{ ...DRAFT, source: 'cvm_ipe', issuerCnpj: COMPANY.cnpj, assetIds: COMPANY.assetIds }]);
        expect(metrics.collected).toHaveBeenCalledWith('cvm_ipe', 1);
    });

    it('does not stop the other sources when one is down', async () => {
        const down: ReturnType<typeof vi.fn> = vi
            .fn()
            .mockRejectedValue(Object.assign(new Error('source.unreachable'), { name: 'CatalogSourceError' }));
        const up: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([DRAFT]);
        const { service, saveMany, metrics, logs } = rig([port('cvm_ipe', 'company', down), port('cvm_itr', 'company', up)]);

        await expect(service.collect([COMPANY])).resolves.toBe(1);

        expect(metrics.sourceFailed).toHaveBeenCalledWith('cvm_ipe', 'source.unreachable');
        expect(logs.sourceFailed).toHaveBeenCalledWith('cvm_ipe', 'source.unreachable');
        expect(saveMany).toHaveBeenCalledWith([expect.objectContaining({ source: 'cvm_itr' })]);
    });

    it('labels an unknown error as unexpected and keeps going with the next issuer', async () => {
        const fetchFor: ReturnType<typeof vi.fn> = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue([DRAFT]);
        const { service, metrics } = rig([port('cvm_ipe', 'company', fetchFor)]);

        await expect(service.collect([COMPANY, OTHER])).resolves.toBe(1);

        expect(metrics.sourceFailed).toHaveBeenCalledWith('cvm_ipe', 'unexpected');
    });

    it('gives up on a source after three failures in a row', async () => {
        const fetchFor: ReturnType<typeof vi.fn> = vi.fn().mockRejectedValue(new Error('boom'));
        const issuers: DocumentIssuer[] = [1, 2, 3, 4, 5].map((index: number): DocumentIssuer => ({
            ...COMPANY,
            cnpj: `0108320000011${String(index)}`
        }));
        const { service } = rig([port('cvm_ipe', 'company', fetchFor)]);

        await service.collect(issuers);

        expect(fetchFor).toHaveBeenCalledTimes(3);
    });

    it('collects nothing when no source is enabled', async () => {
        const { service, saveMany } = rig([]);

        await expect(service.collect([COMPANY])).resolves.toBe(0);
        expect(saveMany).not.toHaveBeenCalled();
    });
});
