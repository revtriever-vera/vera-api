import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AppContext } from '../../../core/context/app-context.port';
import { InvestmentImportReaderService, InvestmentImportRecord } from '../../positions/services/investment-import-reader.service';
import { StoredFixedIncome } from '../domain/fixed-income/fixed-income-import.types';
import { countByProposalStatus } from '../domain/fixed-income/title-proposal';
import { InvestmentImportPreviewDomain } from '../domain/investment-import-preview.domain';
import { ReportTooLargeError } from '../domain/investment-import.errors';
import {
    InvestmentImportPreview,
    MAX_LINES_PER_IMPORT,
    PreviewPayload,
    PreviewView,
    StoredLine,
    UploadedReport
} from '../domain/investment-import.types';
import { sanitizeFileName } from '../domain/file-name';
import { ParsedInvestmentStatement, ParsedSource } from '../domain/investment-statement.types';
import { applyEdits } from '../domain/line-edits';
import { countByStatus } from '../domain/line-counts';
import { ignoredOperationViewOf, operationViewOf, warningsOf } from '../domain/preview-view';
import { ignoredViewsOf, notesOf, storedLinesOf } from '../domain/preview-lines';
import { FixedIncomeProposalService } from '../services/fixed-income-proposal.service';
import { Evaluation, ImportLineEvaluatorService } from '../services/import-line-evaluator.service';
import { InvestmentImportLogService } from '../services/investment-import-log.service';
import { InvestmentImportMetricsService } from '../services/investment-import-metrics.service';
import { StatementReaderService } from '../services/statement-reader.service';

export interface PreviewInput {
    readonly holderUserId?: string;
    readonly positionDate?: string;
}

function viewOf(
    statement: ParsedInvestmentStatement,
    evaluation: Evaluation,
    stored: InvestmentImportPreview,
    fixedIncome: readonly StoredFixedIncome[],
    proposals: FixedIncomeProposalService,
    previous: InvestmentImportRecord | null
): PreviewView {
    return {
        previewId: stored.id,
        source: statement.source,
        notes: notesOf(statement),
        operations: [...evaluation.lines.map(operationViewOf), ...ignoredViewsOf(statement).map(ignoredOperationViewOf)],
        effect: evaluation.effects,
        fixedIncome: fixedIncome.map((entry: StoredFixedIncome) => ({ ...entry, issuer: proposals.issuerView(entry.issuerId) })),
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
        private readonly reader: StatementReaderService,
        private readonly proposals: FixedIncomeProposalService,
        private readonly context: AppContext,
        private readonly logs: InvestmentImportLogService,
        private readonly metrics: InvestmentImportMetricsService
    ) {}

    public async preview(upload: UploadedReport, input: PreviewInput): Promise<PreviewView> {
        const startedAt: number = Date.now();
        const holderUserId: string | null = input.holderUserId ?? null;
        const statement: ParsedInvestmentStatement = await this.reader.read(upload.buffer);
        if (statement.operations.length > MAX_LINES_PER_IMPORT) {
            throw new ReportTooLargeError(MAX_LINES_PER_IMPORT);
        }
        const lines: StoredLine[] = storedLinesOf(statement);
        const evaluation: Evaluation = await this.evaluator.evaluate(holderUserId, applyEdits(lines, []));
        const fixedIncome: StoredFixedIncome[] = await this.proposals.propose(statement, input.positionDate);
        const stored: InvestmentImportPreview = await this.store(upload, statement.source, holderUserId, { lines, fixedIncome });
        const previous: InvestmentImportRecord | null = await this.records.findCompletedByHash(stored.fileSha256);
        this.report(statement.source, evaluation, upload.size, Date.now() - startedAt, countByProposalStatus(fixedIncome));
        return viewOf(statement, evaluation, stored, fixedIncome, this.proposals, previous);
    }

    public async purgeExpired(): Promise<number> {
        const removed: number = await this.previews.purgeExpired();
        this.logs.purged(removed);
        return removed;
    }

    private async store(
        upload: UploadedReport,
        source: ParsedSource,
        holderUserId: string | null,
        payload: PreviewPayload
    ): Promise<InvestmentImportPreview> {
        return this.previews.create({
            createdBy: this.context.getOrNull()?.userId ?? null,
            holderUserId,
            source,
            fileSha256: createHash('sha256').update(upload.buffer).digest('hex'),
            fileName: sanitizeFileName(upload.originalname),
            payload
        });
    }

    private report(
        source: string,
        evaluation: Evaluation,
        sizeBytes: number,
        durationMs: number,
        fixedIncome: Readonly<Record<string, number>>
    ): void {
        this.logs.record('previewed', { source, lines: evaluation.lines.length, durationMs, sizeBytes, fixedIncome });
        this.metrics.outcome(source, 'previewed', durationMs);
        this.metrics.lines(source, countByStatus(evaluation.lines));
        this.metrics.fileSize(source, sizeBytes);
    }
}
