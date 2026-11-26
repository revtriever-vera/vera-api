import { Insertable, Selectable } from 'kysely';
import { MarketDocuments } from '../../../core/database/generated/database.types';
import type { IssuerKind } from '../../portfolio-events/services/issuer-link-reader.service';

export const DOCUMENT_SOURCES = { cvmIpe: 'cvm_ipe', cvmItr: 'cvm_itr', b3Fnet: 'b3_fnet' } as const;
export type DocumentSource = (typeof DOCUMENT_SOURCES)[keyof typeof DOCUMENT_SOURCES];

export const DOCUMENT_STATUSES = {
    pending: 'pending',
    extracted: 'extracted',
    skipped: 'skipped',
    summarized: 'summarized',
    failed: 'failed'
} as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[keyof typeof DOCUMENT_STATUSES];

export const SKIP_REASONS = {
    routineCategory: 'routine_category',
    financialPackage: 'financial_package',
    linkOnly: 'link_only',
    untrustedUrl: 'untrusted_url',
    notPdf: 'not_pdf',
    scanned: 'scanned',
    tooLarge: 'too_large'
} as const;
export type SkipReason = (typeof SKIP_REASONS)[keyof typeof SKIP_REASONS];

export const FAIL_REASONS = { unreachable: 'unreachable' } as const;

export const DOCUMENT_CATEGORIES = {
    relevantFact: 'relevant_fact',
    marketNotice: 'market_notice',
    shareholderNotice: 'shareholder_notice',
    quarterlyResults: 'quarterly_results',
    annualResults: 'annual_results',
    monthlyReport: 'monthly_report',
    managementReport: 'management_report',
    routine: 'routine'
} as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[keyof typeof DOCUMENT_CATEGORIES];

export type MarketDocumentRow = Selectable<MarketDocuments>;
export type MarketDocumentInsert = Insertable<MarketDocuments>;

export interface DocumentIssuer {
    readonly cnpj: string;
    readonly issuerKind: IssuerKind;
    readonly assetIds: readonly string[];
}

export interface DocumentDraft {
    readonly externalId: string;
    readonly category: DocumentCategory;
    readonly title: string;
    readonly publishedAt: string;
    readonly url: string;
    readonly status: typeof DOCUMENT_STATUSES.pending | typeof DOCUMENT_STATUSES.skipped;
    readonly skipReason: SkipReason | null;
}

export interface MarketDocumentWrite extends DocumentDraft {
    readonly source: DocumentSource;
    readonly issuerCnpj: string;
    readonly assetIds: readonly string[];
}

export interface PendingDocument {
    readonly id: string;
    readonly source: DocumentSource;
    readonly url: string;
    readonly attempts: number;
}

export const CNPJ_PATTERN: RegExp = /^\d{14}$/;

export const FEED_STATUSES: readonly DocumentStatus[] = [
    DOCUMENT_STATUSES.extracted,
    DOCUMENT_STATUSES.summarized,
    DOCUMENT_STATUSES.skipped,
    DOCUMENT_STATUSES.failed
];
