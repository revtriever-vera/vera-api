import { Injectable } from '@nestjs/common';
import { countByStatus } from '../domain/line-counts';
import { Evaluation } from './import-line-evaluator.service';
import { InvestmentImportLogService } from './investment-import-log.service';
import { InvestmentImportMetricsService } from './investment-import-metrics.service';

export interface PreviewReport {
    readonly source: string;
    readonly evaluation: Evaluation;
    readonly sizeBytes: number;
    readonly durationMs: number;
    readonly fixedIncome: Readonly<Record<string, number>>;
}

@Injectable()
export class InvestmentImportReporterService {
    public constructor(
        private readonly logs: InvestmentImportLogService,
        private readonly metrics: InvestmentImportMetricsService
    ) {}

    public previewed(report: PreviewReport): void {
        const { source, evaluation, sizeBytes, durationMs, fixedIncome } = report;
        this.logs.record('previewed', { source, lines: evaluation.lines.length, durationMs, sizeBytes, fixedIncome });
        this.metrics.outcome(source, 'previewed', durationMs);
        this.metrics.lines(source, countByStatus(evaluation.lines));
        this.metrics.fileSize(source, sizeBytes);
    }

    public purged(removed: number): void {
        this.logs.purged(removed);
    }
}
