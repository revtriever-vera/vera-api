import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { MarketDocumentSummaryRow, StoredSummary } from '../domain/market-document-summary.types';

type SummaryContent = Pick<MarketDocumentSummaryRow, 'promptVersion' | 'summary' | 'kind' | 'relevance' | 'discard' | 'llmCallId'>;

function contentOf(summary: StoredSummary): SummaryContent {
    return {
        promptVersion: summary.promptVersion,
        summary: summary.summary,
        kind: summary.kind,
        relevance: summary.relevance,
        discard: summary.discard,
        llmCallId: summary.llmCallId
    };
}

@Injectable()
export class MarketDocumentSummariesRepository extends BareGlobalRepository<'MarketDocumentSummaries'> {
    public constructor(database: DatabaseClient) {
        super(database, 'MarketDocumentSummaries');
    }

    public async findForDocument(documentId: string, locale: string): Promise<MarketDocumentSummaryRow | null> {
        return this.findOne({ documentId, locale });
    }

    public async findForDocuments(documentIds: readonly string[], locales: readonly string[]): Promise<MarketDocumentSummaryRow[]> {
        return this.selectScoped()
            .selectAll()
            .where('documentId', 'in', [...documentIds])
            .where('locale', 'in', [...locales])
            .execute();
    }

    public async upsertSummary(summary: StoredSummary): Promise<MarketDocumentSummaryRow> {
        const content: SummaryContent = contentOf(summary);
        return this.upsertRow(
            { id: IdUtil.newId(), documentId: summary.documentId, locale: summary.locale, ...content },
            { columns: ['documentId', 'locale'], update: { ...content, updatedAt: new Date() } }
        );
    }
}
