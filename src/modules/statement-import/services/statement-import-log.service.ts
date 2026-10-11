import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';

const IDENTIFIER: string = 'statement-import';

export type ImportAction = 'previewed' | 'committed' | 'undone' | 'failed';

export interface ImportLogFields {
    readonly importId?: string;
    readonly format?: string;
    readonly rows?: number;
    readonly inserted?: number;
    readonly duplicates?: number;
    readonly rejected?: number;
    readonly durationMs: number;
    readonly sizeBytes?: number;
}

@Injectable()
export class StatementImportLogService {
    public constructor(private readonly logService: LogService) {}

    public record(action: ImportAction, fields: ImportLogFields): void {
        this.logService.info({
            message: `statement import ${action}`,
            identifier: IDENTIFIER,
            meta: {
                action,
                importId: fields.importId,
                format: fields.format,
                rows: fields.rows,
                inserted: fields.inserted,
                duplicates: fields.duplicates,
                rejected: fields.rejected,
                durationMs: fields.durationMs,
                sizeBytes: fields.sizeBytes
            }
        });
    }

    public rollbackFailed(importId: string, errorName: string): void {
        this.logService.error({
            message: 'statement import rollback failed',
            identifier: IDENTIFIER,
            meta: { action: 'failed', importId, errorName }
        });
    }
}
