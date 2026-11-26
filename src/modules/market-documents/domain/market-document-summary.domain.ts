import { Injectable } from '@nestjs/common';
import type { AppLocale } from '../../../shared/i18n/locale';
import { MarketDocumentSummariesRepository } from '../repositories/market-document-summaries.repository';
import { MarketDocumentSummaryRow, StoredSummary, SummaryKind } from './market-document-summary.types';

export interface CachedSummary {
    readonly summary: string;
    readonly kind: SummaryKind;
    readonly relevance: number;
    readonly discard: boolean;
    readonly promptVersion: string;
}

@Injectable()
export class MarketDocumentSummaryDomain {
    public constructor(private readonly summaries: MarketDocumentSummariesRepository) {}

    public async findCurrent(documentId: string, locale: AppLocale, promptVersion: string): Promise<CachedSummary | null> {
        const row: MarketDocumentSummaryRow | null = await this.summaries.findForDocument(documentId, locale);
        if (row?.promptVersion !== promptVersion) {
            return null;
        }
        return {
            summary: row.summary,
            kind: row.kind as SummaryKind,
            relevance: row.relevance,
            discard: row.discard,
            promptVersion: row.promptVersion
        };
    }

    public async save(summary: StoredSummary): Promise<void> {
        await this.summaries.upsertSummary(summary);
    }
}
