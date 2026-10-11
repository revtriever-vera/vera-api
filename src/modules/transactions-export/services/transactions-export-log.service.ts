import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { ExportFormat } from '../../../shared/spreadsheet/spreadsheet.types';

const TRANSACTIONS_EXPORT: string = 'transactions-export';

@Injectable()
export class TransactionsExportLogService {
    public constructor(private readonly logService: LogService) {}

    public exported(format: ExportFormat, rows: number, durationMs: number, sizeBytes: number): void {
        this.logService.info({
            message: 'transactions exported',
            identifier: TRANSACTIONS_EXPORT,
            meta: { format, rows, durationMs, sizeBytes }
        });
    }

    public refused(format: ExportFormat, rows: number): void {
        this.logService.warn({ message: 'transactions export refused', identifier: TRANSACTIONS_EXPORT, meta: { format, rows } });
    }
}
