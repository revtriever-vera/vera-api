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

export interface ModelFileFacts {
    readonly kind: string;
    readonly sizeBytes: number;
    readonly textLayer: boolean;
}

export interface ModelReadFields extends ModelFileFacts {
    readonly calls: number;
    readonly pagesNotRead: number;
    readonly costMicros: number;
    readonly rows: number;
    readonly rejected: number;
}

@Injectable()
export class StatementImportLogService {
    public constructor(private readonly logService: LogService) {}

    public modelRead(fields: ModelReadFields): void {
        this.logService.info({
            message: 'statement import model read',
            identifier: IDENTIFIER,
            meta: { action: 'model_read', ...fields }
        });
    }

    public modelFailed(reason: string, facts: ModelFileFacts): void {
        this.logService.warn({
            message: 'statement import model read failed',
            identifier: IDENTIFIER,
            meta: { action: 'model_failed', reason, ...facts }
        });
    }

    public expiryNotScheduled(previewId: string, errorName: string): void {
        this.logService.warn({
            message: 'statement import preview expiry not scheduled',
            identifier: IDENTIFIER,
            meta: { action: 'preview_expiry_failed', previewId, errorName }
        });
    }

    public previewExpired(previewId: string, removed: number): void {
        this.logService.debug({
            message: 'statement import preview expired',
            identifier: IDENTIFIER,
            meta: { action: 'preview_expired', previewId, removed }
        });
    }

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
