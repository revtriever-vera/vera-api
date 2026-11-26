import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';

const SWEEP: string = 'market-documents-sweep';
const COLLECT: string = 'market-documents-collect';
const EXTRACT: string = 'market-documents-extract';

@Injectable()
export class MarketDocumentsLogService {
    public constructor(private readonly logService: LogService) {}

    public sweepFinished(held: number, issuers: number, collected: number, extracted: number): void {
        this.logService.info({ message: 'sweep finished', identifier: SWEEP, meta: { held, issuers, collected, extracted } });
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
}
