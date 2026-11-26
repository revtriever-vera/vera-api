import { Insertable, Selectable } from 'kysely';
import { MarketDocumentSummaries } from '../../../core/database/generated/database.types';
import type { AppLocale } from '../../../shared/i18n/locale';

export const SUMMARY_KINDS = {
    result: 'result',
    income: 'income',
    relevantFact: 'relevant_fact',
    meeting: 'meeting',
    management: 'management',
    routine: 'routine'
} as const;
export type SummaryKind = (typeof SUMMARY_KINDS)[keyof typeof SUMMARY_KINDS];
export const SUMMARY_KIND_LIST: readonly [SummaryKind, ...SummaryKind[]] = [
    SUMMARY_KINDS.result,
    SUMMARY_KINDS.income,
    SUMMARY_KINDS.relevantFact,
    SUMMARY_KINDS.meeting,
    SUMMARY_KINDS.management,
    SUMMARY_KINDS.routine
];

export const SUMMARY_FAIL_REASON: string = 'summary_invalid';

export const MAX_SUMMARY_CHARS: number = 400;
export const MAX_SUMMARY_SENTENCES: number = 3;
export const MAX_RELEVANCE: number = 3;

export type MarketDocumentSummaryRow = Selectable<MarketDocumentSummaries>;
export type MarketDocumentSummaryInsert = Insertable<MarketDocumentSummaries>;

export interface DocumentSummary {
    readonly summary: string;
    readonly kind: SummaryKind;
    readonly relevance: number;
    readonly discard: boolean;
}

export interface ExtractedDocument {
    readonly id: string;
    readonly category: string;
    readonly title: string;
    readonly publishedAt: Date;
    readonly assetIds: readonly string[];
    readonly attempts: number;
    readonly text: string;
}

export interface SummarySubject {
    readonly issuerName: string;
    readonly tickers: readonly string[];
    readonly category: string;
    readonly publishedAt: string;
    readonly text: string;
}

export interface StoredSummary extends DocumentSummary {
    readonly documentId: string;
    readonly locale: AppLocale;
    readonly promptVersion: string;
    readonly llmCallId: string | null;
}

export const SUMMARY_NOTICES: Readonly<Record<AppLocale, string>> = {
    'pt-BR': 'Isto não é uma recomendação de compra ou venda.',
    en: 'This is not a recommendation to buy or sell.'
};

export const SUMMARY_OUTCOMES = { generated: 'generated', cached: 'cached', invalid: 'invalid', failed: 'failed' } as const;
export type SummaryOutcome = (typeof SUMMARY_OUTCOMES)[keyof typeof SUMMARY_OUTCOMES];
