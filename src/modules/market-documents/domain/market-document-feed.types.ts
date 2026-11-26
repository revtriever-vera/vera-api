import type { AppLocale } from '../../../shared/i18n/locale';
import type { DocumentSource } from './market-documents.types';
import type { SummaryKind } from './market-document-summary.types';

export interface PublicDocumentSummary {
    readonly text: string;
    readonly kind: SummaryKind;
    readonly relevance: number;
    readonly locale: AppLocale;
}

export interface PublicDocumentView {
    readonly id: string;
    readonly source: DocumentSource;
    readonly category: string;
    readonly title: string;
    readonly publishedAt: Date;
    readonly url: string;
    readonly assetIds: readonly string[];
    readonly summary: PublicDocumentSummary | null;
}

export const FEED_DOCUMENTS_LIMIT: number = 500;
