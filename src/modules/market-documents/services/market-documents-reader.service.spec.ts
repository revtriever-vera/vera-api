import { describe, expect, it, vi } from 'vitest';
import { MarketDocumentSummaryDomain } from '../domain/market-document-summary.domain';
import { MarketDocumentDomain } from '../domain/market-document.domain';
import { MarketDocumentsReaderService } from './market-documents-reader.service';

const SINCE: Date = new Date('2026-12-01T00:00:00Z');

function row(id: string): Record<string, unknown> {
    return {
        id,
        source: 'cvm_ipe',
        category: 'relevant_fact',
        title: `T ${id}`,
        publishedAt: SINCE,
        url: `https://example.com/${id}`,
        assetIds: ['a']
    };
}

function summary(documentId: string, locale: string, discard: boolean = false): Record<string, unknown> {
    return { documentId, locale, summary: `${locale} ${documentId}`, kind: 'result', relevance: 2, discard };
}

function build(
    documents: unknown[],
    summaries: unknown[]
): { service: MarketDocumentsReaderService; findForDocuments: ReturnType<typeof vi.fn> } {
    const findForDocuments = vi.fn().mockResolvedValue(summaries);
    const service = new MarketDocumentsReaderService(
        { findFeed: vi.fn().mockResolvedValue(documents) } as unknown as MarketDocumentDomain,
        { findForDocuments } as unknown as MarketDocumentSummaryDomain
    );
    return { service, findForDocuments };
}

describe('MarketDocumentsReaderService', () => {
    it('tira o descartado, mantém o sem resumo com título e link', async () => {
        const { service } = build([row('d1'), row('d2'), row('d3')], [summary('d1', 'pt-BR'), summary('d2', 'pt-BR', true)]);

        const views = await service.listForAssets(['a'], SINCE, 'pt-BR');

        expect(views.map((view) => view.id)).toEqual(['d1', 'd3']);
        expect(views[0]?.summary).toMatchObject({ text: 'pt-BR d1', kind: 'result', relevance: 2 });
        expect(views[1]).toMatchObject({ summary: null, title: 'T d3', url: 'https://example.com/d3' });
    });

    it('prefere o resumo no idioma da conta e cai para pt-BR quando não existe', async () => {
        const { service, findForDocuments } = build(
            [row('d1'), row('d2')],
            [summary('d1', 'pt-BR'), summary('d1', 'en'), summary('d2', 'pt-BR')]
        );

        const views = await service.listForAssets(['a'], SINCE, 'en');

        expect(findForDocuments).toHaveBeenCalledWith(['d1', 'd2'], ['en', 'pt-BR']);
        expect(views.map((view) => view.summary?.text)).toEqual(['en d1', 'pt-BR d2']);
    });

    it('o aviso fixo sai no idioma pedido', () => {
        const { service } = build([], []);

        expect(service.noticeOf('pt-BR')).toBe('Isto não é uma recomendação de compra ou venda.');
        expect(service.noticeOf('en')).toBe('This is not a recommendation to buy or sell.');
    });
});
