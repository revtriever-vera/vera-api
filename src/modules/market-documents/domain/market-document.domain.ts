import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { MarketDocumentsRepository } from '../repositories/market-documents.repository';
import {
    DOCUMENT_STATUSES,
    FAIL_REASONS,
    MarketDocumentRow,
    MarketDocumentWrite,
    PendingDocument,
    SkipReason,
    DocumentSource
} from './market-documents.types';
import { ExtractedDocument, SUMMARY_FAIL_REASON } from './market-document-summary.types';

function merged(left: MarketDocumentWrite, right: MarketDocumentWrite): MarketDocumentWrite {
    return { ...left, assetIds: [...new Set<string>([...left.assetIds, ...right.assetIds])] };
}

@Injectable()
export class MarketDocumentDomain {
    public constructor(private readonly documents: MarketDocumentsRepository) {}

    public async saveMany(documents: readonly MarketDocumentWrite[]): Promise<number> {
        const unique: Map<string, MarketDocumentWrite> = new Map<string, MarketDocumentWrite>();
        for (const document of documents) {
            const key: string = `${document.source}|${document.externalId}`;
            const known: MarketDocumentWrite | undefined = unique.get(key);
            unique.set(key, known === undefined ? document : merged(known, document));
        }
        await this.documents.upsertMany([...unique.values()]);
        return unique.size;
    }

    public async findPending(limit: number): Promise<PendingDocument[]> {
        const rows: MarketDocumentRow[] = await this.documents.findPending(limit);
        return rows.map((row: MarketDocumentRow): PendingDocument => ({
            id: row.id,
            source: row.source as DocumentSource,
            url: row.url,
            attempts: row.attempts
        }));
    }

    public async findFeed(assetIds: readonly string[], since: Date, limit: number): Promise<MarketDocumentRow[]> {
        return assetIds.length === 0 ? [] : this.documents.findFeed(assetIds, since, limit);
    }

    public async markExtracted(id: string, text: string, textHash: string): Promise<boolean> {
        return this.documents.transitionPending(id, {
            status: DOCUMENT_STATUSES.extracted,
            extractedText: text,
            textHash,
            skipReason: null
        });
    }

    public async markSkipped(id: string, reason: SkipReason): Promise<boolean> {
        return this.documents.transitionPending(id, { status: DOCUMENT_STATUSES.skipped, skipReason: reason });
    }

    public async recordFailedAttempt(document: PendingDocument, maxAttempts: number): Promise<boolean> {
        const attempts: number = document.attempts + 1;
        return this.documents.transitionPending(
            document.id,
            attempts >= maxAttempts ? { attempts, status: DOCUMENT_STATUSES.failed, skipReason: FAIL_REASONS.unreachable } : { attempts }
        );
    }

    public async findExtracted(limit: number): Promise<ExtractedDocument[]> {
        const rows: MarketDocumentRow[] = await this.documents.findExtracted(limit);
        return rows.map((row: MarketDocumentRow): ExtractedDocument => ({
            id: row.id,
            category: row.category,
            title: row.title,
            publishedAt: row.publishedAt,
            assetIds: row.assetIds,
            attempts: row.attempts,
            text: row.extractedText ?? ''
        }));
    }

    public async recordSummaryAttempt(document: ExtractedDocument, maxAttempts: number): Promise<boolean> {
        const attempts: number = document.attempts + 1;
        return attempts >= maxAttempts
            ? this.markSummaryFailed(document.id)
            : this.documents.transitionExtracted(document.id, { attempts });
    }

    public async markSummaryFailed(id: string): Promise<boolean> {
        return this.documents.transitionExtracted(id, {
            status: DOCUMENT_STATUSES.failed,
            skipReason: SUMMARY_FAIL_REASON,
            extractedText: null
        });
    }

    public async markSummarized(id: string): Promise<boolean> {
        return this.documents.transitionExtracted(id, { status: DOCUMENT_STATUSES.summarized, extractedText: null });
    }

    public async applyRetention(retentionDays: number): Promise<number> {
        return this.documents.deleteOlderThan(DateUtil.addDays(new Date(), -retentionDays));
    }
}
