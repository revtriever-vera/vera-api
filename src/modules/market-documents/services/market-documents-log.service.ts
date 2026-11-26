import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';

const SWEEP: string = 'market-documents-sweep';
const COLLECT: string = 'market-documents-collect';
const EXTRACT: string = 'market-documents-extract';
const SUMMARY: string = 'market-documents-summary';

@Injectable()
export class MarketDocumentsLogService {
    public constructor(private readonly logService: LogService) {}

    public sweepFinished(held: number, issuers: number, collected: number, extracted: number, summarized: number): void {
        this.logService.info({ message: 'sweep finished', identifier: SWEEP, meta: { held, issuers, collected, extracted, summarized } });
    }

    public retentionApplied(deleted: number): void {
        this.logService.info({ message: 'retention applied', identifier: SWEEP, meta: { deleted } });
    }

    public sourceFailed(source: string, reason: string): void {
        this.logService.warn({ message: 'source failed', identifier: COLLECT, meta: { source, reason } });
    }

    public documentFailed(documentId: string, attempts: number): void {
        this.logService.warn({ message: 'document download failed', identifier: EXTRACT, meta: { documentId, attempts } });
    }

    public summarized(documentId: string, outcome: string, rounds: number, costMicros: number): void {
        this.logService.info({ message: 'document summarized', identifier: SUMMARY, meta: { documentId, outcome, rounds, costMicros } });
    }

    public summaryGuardFailed(documentId: string, check: string, round: number): void {
        this.logService.warn({ message: 'summary guard failed', identifier: SUMMARY, meta: { documentId, check, round } });
    }

    public summaryFailed(documentId: string, attempts: number, error: unknown): void {
        this.logService.warn({ message: 'summary call failed', identifier: SUMMARY, meta: { documentId, attempts }, error });
    }

    public summaryCapReached(pending: number): void {
        this.logService.info({ message: 'summary daily cap reached', identifier: SUMMARY, meta: { pending } });
    }
}
