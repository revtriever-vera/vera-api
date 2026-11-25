import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { CommitOutcome, LineStatus } from '../domain/investment-import.types';

const IMPORTS_TOTAL: string = 'vera_investment_import_total';
const LINES_TOTAL: string = 'vera_investment_import_lines_total';
const DURATION: string = 'vera_investment_import_duration_ms';
const FILE_SIZE: string = 'vera_investment_import_file_bytes';

@Injectable()
export class InvestmentImportMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public outcome(source: string, outcome: CommitOutcome, durationMs: number): void {
        this.metrics.count(IMPORTS_TOTAL, { source, outcome });
        this.metrics.observe(DURATION, durationMs, { source, outcome });
    }

    public lines(source: string, counts: ReadonlyMap<LineStatus, number>): void {
        for (const [status, amount] of counts) {
            if (amount > 0) {
                this.metrics.count(LINES_TOTAL, { source, status }, amount);
            }
        }
    }

    public fileSize(source: string, bytes: number): void {
        this.metrics.observe(FILE_SIZE, bytes, { source });
    }
}
