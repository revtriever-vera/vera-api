import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { ExportFormat } from '../../../shared/spreadsheet/spreadsheet.types';

const EXPORTS_TOTAL: string = 'vera_transactions_export_total';

export type ExportResult = 'ok' | 'too_large';

@Injectable()
export class TransactionsExportMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public exported(format: ExportFormat, result: ExportResult): void {
        this.metrics.count(EXPORTS_TOTAL, { format, result });
    }
}
