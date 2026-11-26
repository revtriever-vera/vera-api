import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { JsonObject } from '../../../core/llm/llm.types';
import { sanitizeFileName } from '../domain/file-name';
import { importDoneText, importProposalSummary, ImportCounts } from '../domain/import-assistant-texts';
import { InvestmentImportPreviewDomain } from '../domain/investment-import-preview.domain';
import { InvalidCorrectionsError, NothingToImportError } from '../domain/investment-import.errors';
import { CommitView, LINE_STATUSES, OperationLineView, PreviewView, UploadedReport } from '../domain/investment-import.types';
import { commitBodySchema } from '../validation/investment-import.schemas';
import { ImportProposalPayload, importProposalPayloadSchema } from '../validation/import-proposal-payload.schema';
import { CommitInput, InvestmentImportCommitService } from './investment-import-commit.service';
import { InvestmentImportPreviewService } from './investment-import-preview.service';

export type { UploadedReport } from '../domain/investment-import.types';

export interface ImportProposal {
    readonly fileName: string;
    readonly summary: string;
    readonly payload: JsonObject;
}

export interface ImportCorrections {
    readonly edits?: readonly Record<string, unknown>[];
    readonly fixedIncome?: readonly Record<string, unknown>[];
}

export interface ImportConfirmation {
    readonly text: string;
    readonly importId: string;
}

export const INVESTMENT_IMPORT_TOOL: string = 'investment_import';

const STATE_OPEN: string = 'open';
const STATE_GONE: string = 'gone';

function countsOf(view: PreviewView): ImportCounts {
    const lines: OperationLineView[] = view.operations.filter((line: OperationLineView): boolean => line.status !== LINE_STATUSES.ignored);
    const tickers: Set<string> = new Set(lines.map((line: OperationLineView): string => line.ticker ?? line.lineId));
    return { operations: lines.length, assets: tickers.size, titles: view.fixedIncome.length };
}

function commitInputOf(previewId: string, corrections: ImportCorrections | null): CommitInput {
    const body: ReturnType<typeof commitBodySchema.safeParse> = commitBodySchema.safeParse({
        previewId,
        edits: corrections?.edits ?? [],
        fixedIncome: corrections?.fixedIncome ?? []
    });
    if (!body.success) {
        throw new InvalidCorrectionsError();
    }
    return body.data;
}

@Injectable()
export class InvestmentImportAssistantService {
    public constructor(
        private readonly previews: InvestmentImportPreviewService,
        private readonly commits: InvestmentImportCommitService,
        private readonly previewDomain: InvestmentImportPreviewDomain,
        private readonly context: AppContext
    ) {}

    public async propose(upload: UploadedReport, modelConsent: boolean): Promise<ImportProposal> {
        const view: PreviewView = await this.previews.preview(upload, { modelConsent });
        const counts: ImportCounts = countsOf(view);
        if (counts.operations === 0 && counts.titles === 0) {
            throw new NothingToImportError();
        }
        const payload: ImportProposalPayload = { previewId: view.previewId, documentType: view.documentType, notes: [...view.notes] };
        return {
            fileName: sanitizeFileName(upload.originalname),
            summary: importProposalSummary(counts, this.context.get().locale),
            payload
        };
    }

    public async stateOf(payload: JsonObject): Promise<string> {
        const parsed: ImportProposalPayload = importProposalPayloadSchema.parse(payload);
        return (await this.previewDomain.findOpen(parsed.previewId)) === null ? STATE_GONE : STATE_OPEN;
    }

    public async view(payload: JsonObject): Promise<JsonObject | null> {
        const parsed: ImportProposalPayload = importProposalPayloadSchema.parse(payload);
        const view: PreviewView | null = await this.previews.rebuild(parsed.previewId, {
            documentType: parsed.documentType,
            notes: parsed.notes
        });
        return view === null ? null : (structuredClone(view) as unknown as JsonObject);
    }

    public async confirm(payload: JsonObject, corrections: ImportCorrections | null): Promise<ImportConfirmation> {
        const parsed: ImportProposalPayload = importProposalPayloadSchema.parse(payload);
        const view: CommitView = await this.commits.commit(commitInputOf(parsed.previewId, corrections));
        return { text: importDoneText(view.applied, view.fixedIncome.length, this.context.get().locale), importId: view.importId };
    }
}
