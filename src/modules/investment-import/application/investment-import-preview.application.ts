import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AppContext } from '../../../core/context/app-context.port';
import { InvestmentImportReaderService, InvestmentImportRecord } from '../../positions/services/investment-import-reader.service';
import { InvestmentImportPreviewDomain } from '../domain/investment-import-preview.domain';
import { ReportTooLargeError } from '../domain/investment-import.errors';
import { InvestmentImportPreview, MAX_LINES_PER_IMPORT, PreviewView, StoredLine, UploadedReport } from '../domain/investment-import.types';
import { sanitizeFileName } from '../domain/file-name';
import { ParsedInvestmentStatement } from '../domain/investment-statement.types';
import { applyEdits } from '../domain/line-edits';
import { countByStatus } from '../domain/line-counts';
import { ignoredOperationViewOf, operationViewOf, warningsOf } from '../domain/preview-view';
import { ignoredViewsOf, notesOf, storedLinesOf } from '../domain/preview-lines';
import { readB3Report } from '../domain/b3/b3-file.reader';
import { Evaluation, ImportLineEvaluatorService } from '../services/import-line-evaluator.service';
import { InvestmentImportLogService } from '../services/investment-import-log.service';
import { InvestmentImportMetricsService } from '../services/investment-import-metrics.service';

export interface PreviewInput {
    readonly holderUserId?: string;
}

function viewOf(
    statement: ParsedInvestmentStatement,
    evaluation: Evaluation,
    stored: InvestmentImportPreview,
    previous: InvestmentImportRecord | null
): PreviewView {
    return {
        previewId: stored.id,
        source: statement.source,
        notes: notesOf(statement),
        operations: [...evaluation.lines.map(operationViewOf), ...ignoredViewsOf(statement).map(ignoredOperationViewOf)],
        effect: evaluation.effects,
        fixedIncome: [],
        warnings: warningsOf(evaluation.lines),
        alreadyImportedAt: previous === null ? null : previous.createdAt.toISOString(),
        expiresAt: stored.expiresAt.toISOString()
    };
}

@Injectable()
export class InvestmentImportPreviewApplication {
    public constructor(
        private readonly evaluator: ImportLineEvaluatorService,
        private readonly previews: InvestmentImportPreviewDomain,
        private readonly records: InvestmentImportReaderService,
        private readonly context: AppContext,
        private readonly logs: InvestmentImportLogService,
        private readonly metrics: InvestmentImportMetricsService
    ) {}

    public async preview(upload: UploadedReport, input: PreviewInput): Promise<PreviewView> {
        const startedAt: number = Date.now();
        const holderUserId: string | null = input.holderUserId ?? null;
        const statement: ParsedInvestmentStatement = await readB3Report(upload.buffer);
        if (statement.operations.length > MAX_LINES_PER_IMPORT) {
            throw new ReportTooLargeError(MAX_LINES_PER_IMPORT);
        }
        const lines: StoredLine[] = storedLinesOf(statement);
        const evaluation: Evaluation = await this.evaluator.evaluate(holderUserId, applyEdits(lines, []));
        const sha256: string = createHash('sha256').update(upload.buffer).digest('hex');
        const stored: InvestmentImportPreview = await this.previews.create({
            createdBy: this.context.getOrNull()?.userId ?? null,
            holderUserId,
            source: statement.source,
            fileSha256: sha256,
            fileName: sanitizeFileName(upload.originalname),
            payload: { lines }
        });
        const previous: InvestmentImportRecord | null = await this.records.findCompletedByHash(sha256);
        this.report(statement.source, evaluation, upload.size, Date.now() - startedAt);
        return viewOf(statement, evaluation, stored, previous);
    }

    public async purgeExpired(): Promise<number> {
        const removed: number = await this.previews.purgeExpired();
        this.logs.purged(removed);
        return removed;
    }

    private report(source: string, evaluation: Evaluation, sizeBytes: number, durationMs: number): void {
        this.logs.record('previewed', { source, lines: evaluation.lines.length, durationMs, sizeBytes });
        this.metrics.outcome(source, 'previewed', durationMs);
        this.metrics.lines(source, countByStatus(evaluation.lines));
        this.metrics.fileSize(source, sizeBytes);
    }
}
