import { Injectable } from '@nestjs/common';
import { AppLocale, DEFAULT_LOCALE } from '../../../shared/i18n/locale';
import { PublicDocumentSummary, PublicDocumentView, FEED_DOCUMENTS_LIMIT } from '../domain/market-document-feed.types';
import { MarketDocumentSummaryDomain } from '../domain/market-document-summary.domain';
import { MarketDocumentSummaryRow, SUMMARY_NOTICES, SummaryKind } from '../domain/market-document-summary.types';
import { MarketDocumentDomain } from '../domain/market-document.domain';
import { DocumentSource, MarketDocumentRow } from '../domain/market-documents.types';

export type { PublicDocumentView } from '../domain/market-document-feed.types';
export type { SummaryKind } from '../domain/market-document-summary.types';
export { SUMMARY_KIND_LIST } from '../domain/market-document-summary.types';

function preferred(rows: readonly MarketDocumentSummaryRow[], locale: AppLocale): Map<string, MarketDocumentSummaryRow> {
    const chosen: Map<string, MarketDocumentSummaryRow> = new Map<string, MarketDocumentSummaryRow>();
    for (const row of rows) {
        if (!chosen.has(row.documentId) || row.locale === locale) {
            chosen.set(row.documentId, row);
        }
    }
    return chosen;
}

function summaryOf(row: MarketDocumentSummaryRow): PublicDocumentSummary {
    return { text: row.summary, kind: row.kind as SummaryKind, relevance: row.relevance, locale: row.locale as AppLocale };
}

function viewOf(document: MarketDocumentRow, summary: MarketDocumentSummaryRow | undefined): PublicDocumentView {
    return {
        id: document.id,
        source: document.source as DocumentSource,
        category: document.category,
        title: document.title,
        publishedAt: document.publishedAt,
        url: document.url,
        assetIds: document.assetIds,
        summary: summary === undefined ? null : summaryOf(summary)
    };
}

@Injectable()
export class MarketDocumentsReaderService {
    public constructor(
        private readonly documents: MarketDocumentDomain,
        private readonly summaries: MarketDocumentSummaryDomain
    ) {}

    public noticeOf(locale: AppLocale): string {
        return SUMMARY_NOTICES[locale];
    }

    public async listForAssets(assetIds: readonly string[], since: Date, locale: AppLocale): Promise<PublicDocumentView[]> {
        const rows: MarketDocumentRow[] = await this.documents.findFeed(assetIds, since, FEED_DOCUMENTS_LIMIT);
        const locales: AppLocale[] = locale === DEFAULT_LOCALE ? [DEFAULT_LOCALE] : [locale, DEFAULT_LOCALE];
        const summaries: MarketDocumentSummaryRow[] = await this.summaries.findForDocuments(
            rows.map((row: MarketDocumentRow): string => row.id),
            locales
        );
        const byDocument: Map<string, MarketDocumentSummaryRow> = preferred(summaries, locale);
        return rows
            .filter((row: MarketDocumentRow): boolean => byDocument.get(row.id)?.discard !== true)
            .map((row: MarketDocumentRow): PublicDocumentView => viewOf(row, byDocument.get(row.id)));
    }
}
