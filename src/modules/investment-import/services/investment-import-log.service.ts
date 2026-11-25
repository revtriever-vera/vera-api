import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { CommitOutcome } from '../domain/investment-import.types';

const IDENTIFIER: string = 'investment-import';

export interface ImportLogFields {
    readonly source: string;
    readonly importId?: string;
    readonly previewId?: string;
    readonly lines?: number;
    readonly blocked?: number;
    readonly applied?: number;
    readonly skipped?: number;
    readonly durationMs: number;
    readonly sizeBytes?: number;
    readonly fixedIncome?: Readonly<Record<string, number>>;
    readonly titles?: number;
}

export interface ModelReadLogFields {
    readonly kind: string;
    readonly sizeBytes: number;
    readonly calls: number;
    readonly pagesNotRead: number;
    readonly costMicros: number;
    readonly operations: number;
    readonly rejected: number;
    readonly documentType: string | null;
}

@Injectable()
export class InvestmentImportLogService {
    public constructor(private readonly logService: LogService) {}

    public record(action: CommitOutcome, fields: ImportLogFields): void {
        this.logService.info({
            message: `investment import ${action}`,
            identifier: IDENTIFIER,
            meta: { action, ...fields }
        });
    }

    public purged(removed: number): void {
        this.logService.info({ message: 'investment import previews purged', identifier: IDENTIFIER, meta: { action: 'purged', removed } });
    }

    public modelRead(fields: ModelReadLogFields): void {
        this.logService.info({
            message: 'investment import model read',
            identifier: IDENTIFIER,
            meta: { action: 'model_read', ...fields }
        });
    }

    public modelFailed(reason: string, fields: Pick<ModelReadLogFields, 'kind' | 'sizeBytes'>): void {
        this.logService.warn({
            message: 'investment import model read failed',
            identifier: IDENTIFIER,
            meta: { action: 'model_failed', reason, ...fields }
        });
    }
}
