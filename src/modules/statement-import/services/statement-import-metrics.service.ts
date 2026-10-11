import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { ImportAction } from './statement-import-log.service';

const IMPORTS_TOTAL: string = 'vera_statement_imports_total';
const ROWS_TOTAL: string = 'vera_statement_import_rows_total';

export interface RowOutcomes {
    readonly inserted: number;
    readonly duplicate: number;
    readonly rejected: number;
}

@Injectable()
export class StatementImportMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public imported(format: string, result: ImportAction): void {
        this.metrics.count(IMPORTS_TOTAL, { format, result });
    }

    public rows(format: string, outcomes: RowOutcomes): void {
        this.countRows(format, 'inserted', outcomes.inserted);
        this.countRows(format, 'duplicate', outcomes.duplicate);
        this.countRows(format, 'rejected', outcomes.rejected);
    }

    private countRows(format: string, outcome: string, amount: number): void {
        if (amount > 0) {
            this.metrics.count(ROWS_TOTAL, { format, outcome }, amount);
        }
    }
}
