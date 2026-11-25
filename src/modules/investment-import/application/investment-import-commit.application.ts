import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { FixedIncomeTitleImporterService, TitleProbe } from '../../fixed-income/services/fixed-income-title-importer.service';
import { ApplyResult, PositionOperationsService } from '../../positions/services/position-operations.service';
import { FixedIncomeDecision, FixedIncomeOutcome } from '../domain/fixed-income/fixed-income-import.types';
import { outcomesOf, planTitles, PlannedTitle, probeOfDraft } from '../domain/fixed-income/title-decisions';
import { InvestmentImportPreviewDomain } from '../domain/investment-import-preview.domain';
import { BlockedLinesError, DuplicateTitleError, PositionModeRequiredError } from '../domain/investment-import.errors';
import {
    CommitView,
    EvaluatedLine,
    InvestmentImportPreview,
    LINE_REASONS,
    LINE_STATUSES,
    LineEdit,
    MAX_REPORTED_LINE_IDS,
    PreviewPayload
} from '../domain/investment-import.types';
import { ParsedSource } from '../domain/investment-statement.types';
import { countByStatus, idsWithStatus } from '../domain/line-counts';
import { applyEdits } from '../domain/line-edits';
import { Evaluation, ImportLineEvaluatorService } from '../services/import-line-evaluator.service';
import { InvestmentImportLogService } from '../services/investment-import-log.service';
import { InvestmentImportMetricsService } from '../services/investment-import-metrics.service';
import { previewPayloadSchema } from '../validation/preview-payload.schema';

export interface CommitInput {
    readonly previewId: string;
    readonly edits: readonly LineEdit[];
    readonly fixedIncome: readonly FixedIncomeDecision[];
}

interface Committed {
    readonly view: CommitView;
    readonly source: ParsedSource;
    readonly lines: readonly EvaluatedLine[];
}

@Injectable()
export class InvestmentImportCommitApplication {
    public constructor(
        private readonly evaluator: ImportLineEvaluatorService,
        private readonly previews: InvestmentImportPreviewDomain,
        private readonly positions: PositionOperationsService,
        private readonly titles: FixedIncomeTitleImporterService,
        private readonly context: AppContext,
        private readonly logs: InvestmentImportLogService,
        private readonly metrics: InvestmentImportMetricsService
    ) {}

    public async commit(input: CommitInput): Promise<CommitView> {
        const startedAt: number = Date.now();
        const committed: Committed = await this.persist(input);
        const durationMs: number = Date.now() - startedAt;
        this.logs.record('committed', {
            source: committed.source,
            importId: committed.view.importId,
            previewId: input.previewId,
            lines: committed.lines.length,
            applied: committed.view.applied,
            skipped: committed.view.skipped,
            titles: committed.view.fixedIncome.length,
            durationMs
        });
        this.metrics.outcome(committed.source, 'committed', durationMs);
        this.metrics.lines(committed.source, countByStatus(committed.lines));
        return committed.view;
    }

    @UsingTransaction()
    private async persist(input: CommitInput): Promise<Committed> {
        const preview: InvestmentImportPreview = await this.previews.consume(input.previewId);
        const payload: PreviewPayload = previewPayloadSchema.parse(preview.payload);
        const evaluation: Evaluation = await this.evaluator.evaluate(preview.holderUserId, applyEdits(payload.lines, input.edits));
        assertCommittable(evaluation.lines);
        const planned: PlannedTitle[] = planTitles(payload.fixedIncome, input.fixedIncome);
        const created: { readonly id: string } = await this.openImport(preview);
        const result: ApplyResult = await this.positions.apply(created.id, preview.holderUserId, evaluation.operations);
        const view: CommitView = {
            importId: created.id,
            applied: result.applied,
            skipped: evaluation.lines.length - result.applied,
            positions: evaluation.effects,
            fixedIncome: await this.createTitles(planned, created.id, preview.holderUserId)
        };
        return { view, source: preview.source as ParsedSource, lines: evaluation.lines };
    }

    private async openImport(preview: InvestmentImportPreview): Promise<{ readonly id: string }> {
        return this.positions.createImport({
            createdBy: this.context.getOrNull()?.userId ?? null,
            source: preview.source as ParsedSource,
            fileSha256: preview.fileSha256,
            fileName: preview.fileName,
            noteNumbers: []
        });
    }

    private async assertNotDuplicated(planned: readonly PlannedTitle[]): Promise<void> {
        const duplicated: boolean[] = await this.titles.duplicates(
            planned.map((title: PlannedTitle): TitleProbe => probeOfDraft(title.draft))
        );
        const clash: number = duplicated.findIndex((flag: boolean, index: number): boolean => flag && planned[index]?.forced === false);
        if (clash >= 0) {
            throw new DuplicateTitleError((planned[clash] as PlannedTitle).lineId);
        }
    }

    private async createTitles(
        planned: readonly PlannedTitle[],
        importId: string,
        holderUserId: string | null
    ): Promise<FixedIncomeOutcome[]> {
        await this.assertNotDuplicated(planned);
        const ids: readonly string[] = await this.titles.createAll(
            planned.map((title: PlannedTitle) => title.draft),
            importId,
            holderUserId
        );
        return outcomesOf(planned, ids);
    }
}

function assertCommittable(lines: readonly EvaluatedLine[]): void {
    const blocked: string[] = idsWithStatus(lines, LINE_STATUSES.blocked);
    if (blocked.length > 0) {
        throw new BlockedLinesError(blocked.slice(0, MAX_REPORTED_LINE_IDS), blocked.length);
    }
    const unchosen: string[] = idsWithStatus(
        lines.filter((line: EvaluatedLine): boolean => line.reason === LINE_REASONS.positionModeRequired),
        LINE_STATUSES.check
    );
    if (unchosen.length > 0) {
        throw new PositionModeRequiredError(unchosen.slice(0, MAX_REPORTED_LINE_IDS), unchosen.length);
    }
}
