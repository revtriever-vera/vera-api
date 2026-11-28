import { describe, expect, it, vi } from 'vitest';
import { LlmInvalidResponseError } from '../../../core/llm/llm.errors';
import { CapReachedError } from '../../../core/usage/usage.errors';
import { parseMarketDocumentsConfig } from '../config/market-documents.config';
import { ExtractedDocument } from '../domain/market-document-summary.types';
import { MarketDocumentSummarizerService } from './market-document-summarizer.service';

const TEXT: string = 'A Companhia informa lucro líquido de R$ 500 milhões no trimestre.';
const GOOD: string = JSON.stringify({
    summary: 'A Companhia teve lucro líquido de R$ 500 milhões no trimestre.',
    kind: 'result',
    relevance: 2,
    discard: false,
    numbers: ['R$ 500 milhões']
});
const INVENTED: string = JSON.stringify({
    summary: 'A Companhia teve lucro líquido de R$ 900 milhões no trimestre.',
    kind: 'result',
    relevance: 2,
    discard: false,
    numbers: []
});

function document(id: string = 'doc-1', attempts: number = 0): ExtractedDocument {
    return {
        id,
        category: 'quarterly_results',
        title: 'ITR',
        publishedAt: new Date('2026-11-20T12:00:00Z'),
        assetIds: ['a1'],
        attempts,
        text: TEXT
    };
}

function rig(options: { documents?: ExtractedDocument[]; cached?: boolean; enabled?: boolean } = {}) {
    const llm = { generate: vi.fn() };
    const documents = {
        findExtracted: vi.fn().mockResolvedValue(options.documents ?? [document()]),
        markSummarized: vi.fn().mockResolvedValue(true),
        markSummaryFailed: vi.fn().mockResolvedValue(true),
        recordSummaryAttempt: vi.fn().mockResolvedValue(true)
    };
    const summaries = {
        findCurrent: vi.fn().mockResolvedValue(options.cached === true ? { summary: 'x' } : null),
        save: vi.fn().mockResolvedValue(undefined)
    };
    const metrics = { summary: vi.fn(), summaryCost: vi.fn() };
    const logs = { summarized: vi.fn(), summaryGuardFailed: vi.fn(), summaryFailed: vi.fn(), summaryCapReached: vi.fn() };
    const service: MarketDocumentSummarizerService = new MarketDocumentSummarizerService(
        parseMarketDocumentsConfig({ MARKET_DOC_MAX_ATTEMPTS: '3' }),
        llm,
        { enabled: vi.fn().mockResolvedValue(options.enabled ?? true) } as never,
        { findManyByIds: vi.fn().mockResolvedValue([{ name: 'Petrobras', symbol: 'PETR4' }]) } as never,
        documents as never,
        summaries as never,
        metrics as never,
        logs as never
    );
    return { service, llm, documents, summaries, metrics, logs };
}

const answer = (text: string, costMicros: number = 100) => ({ text, costMicros, callId: 'call-1' });

describe('MarketDocumentSummarizerService', () => {
    it('resume uma vez, guarda com a chamada e baixa o texto do documento', async () => {
        const { service, llm, summaries, documents, metrics } = rig();
        llm.generate.mockResolvedValueOnce(answer(GOOD));

        await expect(service.summarizePending()).resolves.toBe(1);

        expect(summaries.save).toHaveBeenCalledWith(
            expect.objectContaining({ documentId: 'doc-1', locale: 'pt-BR', promptVersion: 'v1', llmCallId: 'call-1', kind: 'result' })
        );
        expect(documents.markSummarized).toHaveBeenCalledWith('doc-1');
        expect(metrics.summaryCost).toHaveBeenCalledWith(100);
    });

    it('segundo pedido do mesmo documento não chama o modelo', async () => {
        const { service, llm, documents } = rig({ cached: true });

        await expect(service.summarize(document())).resolves.toBe('cached');

        expect(llm.generate).not.toHaveBeenCalled();
        expect(documents.markSummarized).toHaveBeenCalledWith('doc-1');
    });

    it('número inventado reprova, a segunda tentativa recebe a correção e passa', async () => {
        const { service, llm, summaries } = rig();
        llm.generate.mockResolvedValueOnce(answer(INVENTED)).mockResolvedValueOnce(answer(GOOD));

        await service.summarizePending();

        expect(llm.generate).toHaveBeenCalledTimes(2);
        const second = llm.generate.mock.calls[1]?.[0] as { messages: unknown[] };
        expect(second.messages).toHaveLength(3);
        expect(summaries.save).toHaveBeenCalledTimes(1);
    });

    it('reprovado duas vezes: o documento fica só com título e link (failed) e o custo das duas entra', async () => {
        const { service, llm, summaries, documents, metrics } = rig();
        llm.generate.mockResolvedValue(answer(INVENTED, 40));

        await expect(service.summarizePending()).resolves.toBe(0);

        expect(summaries.save).not.toHaveBeenCalled();
        expect(documents.markSummaryFailed).toHaveBeenCalledWith('doc-1');
        expect(metrics.summaryCost).toHaveBeenCalledWith(80);
    });

    it('teto do dia estourado: sem resumo, o documento continua extraído para o dia seguinte e o lote para', async () => {
        const { service, llm, documents, logs } = rig({ documents: [document('a'), document('b')] });
        llm.generate.mockRejectedValue(new CapReachedError('market_docs', null, null));

        await expect(service.summarizePending()).resolves.toBe(0);

        expect(llm.generate).toHaveBeenCalledTimes(1);
        expect(documents.markSummarized).not.toHaveBeenCalled();
        expect(documents.markSummaryFailed).not.toHaveBeenCalled();
        expect(logs.summaryCapReached).toHaveBeenCalledWith(2);
    });

    it('falha do provedor conta tentativa e segue para o próximo', async () => {
        const { service, llm, documents } = rig({ documents: [document('a'), document('b')] });
        llm.generate.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(answer(GOOD));

        await expect(service.summarizePending()).resolves.toBe(1);

        expect(documents.recordSummaryAttempt).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 3);
    });

    it('resposta ilegível do modelo conta como rodada reprovada', async () => {
        const { service, llm, documents } = rig();
        llm.generate.mockRejectedValue(new LlmInvalidResponseError('market_document_summary'));

        await service.summarizePending();

        expect(documents.markSummaryFailed).toHaveBeenCalledWith('doc-1');
    });

    it('sem chave do modelo nada é consultado nem gasto: título e link ficam', async () => {
        const { service, llm, documents } = rig({ enabled: false });

        await expect(service.summarizePending()).resolves.toBe(0);

        expect(documents.findExtracted).not.toHaveBeenCalled();
        expect(llm.generate).not.toHaveBeenCalled();
    });

    it('a requisição enviada ao modelo não carrega campo de conta', async () => {
        const { service, llm } = rig();
        llm.generate.mockResolvedValueOnce(answer(GOOD));

        await service.summarizePending();

        const request: Record<string, unknown> = llm.generate.mock.calls[0]?.[0];
        const serialized: string = JSON.stringify({ ...request, system: '' });
        expect(serialized).not.toMatch(/"(companyId|userId|accountId|tenantId)"/);
        expect(request['feature']).toBe('market_docs');
    });
});
