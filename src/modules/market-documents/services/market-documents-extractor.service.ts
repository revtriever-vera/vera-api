import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { marketDocumentsConfig } from '../config/market-documents.config';
import { MarketDocumentDomain } from '../domain/market-document.domain';
import { DOCUMENT_STATUSES, PendingDocument } from '../domain/market-documents.types';
import { MarketDocumentTextService, TextOutcome } from './market-document-text.service';
import { MarketDocumentsLogService } from './market-documents-log.service';
import { MarketDocumentsMetricsService } from './market-documents-metrics.service';

const RETRY: string = 'retry';

@Injectable()
export class MarketDocumentsExtractorService {
    public constructor(
        @Inject(marketDocumentsConfig.KEY) private readonly config: ConfigType<typeof marketDocumentsConfig>,
        private readonly documents: MarketDocumentDomain,
        private readonly text: MarketDocumentTextService,
        private readonly metrics: MarketDocumentsMetricsService,
        private readonly logs: MarketDocumentsLogService
    ) {}

    public async extractPending(): Promise<number> {
        const pending: PendingDocument[] = await this.documents.findPending(this.config.MARKET_DOC_EXTRACT_BATCH);
        let extracted: number = 0;
        for (const document of pending) {
            extracted += (await this.extractOne(document)) ? 1 : 0;
        }
        return extracted;
    }

    private async extractOne(document: PendingDocument): Promise<boolean> {
        try {
            return await this.store(document, await this.text.read(document.url));
        } catch {
            await this.documents.recordFailedAttempt(document, this.config.MARKET_DOC_MAX_ATTEMPTS);
            this.logs.documentFailed(document.id, document.attempts + 1);
            this.metrics.extracted(document.attempts + 1 >= this.config.MARKET_DOC_MAX_ATTEMPTS ? DOCUMENT_STATUSES.failed : RETRY);
            return false;
        }
    }

    private async store(document: PendingDocument, outcome: TextOutcome): Promise<boolean> {
        if (outcome.kind === 'skipped') {
            await this.documents.markSkipped(document.id, outcome.reason);
            this.metrics.extracted(outcome.reason);
            return false;
        }
        await this.documents.markExtracted(document.id, outcome.text, outcome.textHash);
        this.metrics.extracted(DOCUMENT_STATUSES.extracted);
        return true;
    }
}
