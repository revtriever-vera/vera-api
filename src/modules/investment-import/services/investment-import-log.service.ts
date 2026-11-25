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
}
