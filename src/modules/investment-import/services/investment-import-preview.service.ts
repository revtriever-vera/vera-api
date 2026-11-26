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
    NoteView,
    StoredLine,
    UploadedReport
} from '../domain/investment-import.types';
import { sanitizeFileName } from '../domain/file-name';
import { ParsedInvestmentStatement, ParsedSource } from '../domain/investment-statement.types';
import { applyEdits } from '../domain/line-edits';
import { countByStatus } from '../domain/line-counts';
import { ignoredOperationViewOf, operationViewOf, warningsOf } from '../domain/preview-view';
import { ignoredViewsOf, notesOf, storedLinesOf } from '../domain/preview-lines';
import { FixedIncomeProposalService } from './fixed-income-proposal.service';
import { Evaluation, ImportLineEvaluatorService } from './import-line-evaluator.service';
import { InvestmentImportLogService } from './investment-import-log.service';
import { InvestmentImportMetricsService } from './investment-import-metrics.service';
import { previewPayloadSchema } from '../validation/preview-payload.schema';
import { StatementReaderService } from './statement-reader.service';

export interface PreviewInput {
    readonly holderUserId?: string;
    readonly positionDate?: string;
    readonly modelConsent?: boolean;
}

export interface PreviewMeta {
    readonly documentType: string | null;
    readonly notes: readonly NoteView[];
}

interface ViewParts {
    readonly stored: InvestmentImportPreview;
    readonly source: string;
    readonly meta: PreviewMeta;
    readonly operations: PreviewView['operations'];
    readonly evaluation: Evaluation;
    readonly fixedIncome: readonly StoredFixedIncome[];
    readonly previous: InvestmentImportRecord | null;
}

function viewOf(parts: ViewParts, proposals: FixedIncomeProposalService): PreviewView {
    return {
        previewId: parts.stored.id,
        source: parts.source,
        documentType: parts.meta.documentType,
        notes: parts.meta.notes,
        operations: parts.operations,
        effect: parts.evaluation.effects,
        fixedIncome: parts.fixedIncome.map((entry: StoredFixedIncome) => ({ ...entry, issuer: proposals.issuerView(entry.issuerId) })),
        warnings: warningsOf(parts.evaluation.lines, parts.evaluation.foreignChecks),
        alreadyImportedAt: parts.previous === null ? null : parts.previous.createdAt.toISOString(),
        expiresAt: parts.stored.expiresAt.toISOString()
    };
}

@Injectable()
export class InvestmentImportPreviewService {
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
        const statement: ParsedInvestmentStatement = await this.reader.read(upload.buffer, input.modelConsent === true);
        if (statement.operations.length > MAX_LINES_PER_IMPORT) {
            throw new ReportTooLargeError(MAX_LINES_PER_IMPORT);
        }
        const lines: StoredLine[] = storedLinesOf(statement);
        const evaluation: Evaluation = await this.evaluator.evaluate(holderUserId, applyEdits(lines, []));
        const fixedIncome: StoredFixedIncome[] = await this.proposals.propose(statement, input.positionDate);
        const stored: InvestmentImportPreview = await this.store(upload, statement.source, holderUserId, { lines, fixedIncome });
        const previous: InvestmentImportRecord | null = await this.records.findCompletedByHash(stored.fileSha256);
        this.report(statement.source, evaluation, upload.size, Date.now() - startedAt, countByProposalStatus(fixedIncome));
        const meta: PreviewMeta = { documentType: statement.documentType ?? null, notes: notesOf(statement) };
        const operations: PreviewView['operations'] = [
            ...evaluation.lines.map(operationViewOf),
            ...ignoredViewsOf(statement).map(ignoredOperationViewOf)
        ];
        return viewOf({ stored, source: statement.source, meta, operations, evaluation, fixedIncome, previous }, this.proposals);
    }

    public async rebuild(previewId: string, meta: PreviewMeta): Promise<PreviewView | null> {
        const stored: InvestmentImportPreview | null = await this.previews.findOpen(previewId);
        if (stored === null) {
            return null;
        }
        const payload: PreviewPayload = previewPayloadSchema.parse(stored.payload);
        const evaluation: Evaluation = await this.evaluator.evaluate(stored.holderUserId, applyEdits(payload.lines, []));
        const previous: InvestmentImportRecord | null = await this.records.findCompletedByHash(stored.fileSha256);
        return viewOf(
            {
                stored,
                source: stored.source,
                meta,
                operations: evaluation.lines.map(operationViewOf),
                evaluation,
                fixedIncome: payload.fixedIncome,
                previous
            },
            this.proposals
        );
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
