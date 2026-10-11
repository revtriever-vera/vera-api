import { InvalidFileError } from './statement-import.errors';
import {
    DESCRIPTION_MAX_LENGTH,
    INVALID_FILE_REASONS,
    ImportFormat,
    ParsedRow,
    ParsedStatement,
    REJECTION_REASONS,
    Rejection
} from './statement-import.types';
import { CsvRecord } from './csv-reader';
import { clip } from './statement-values';

export interface RowDraft {
    readonly line: number;
    readonly date: string | null;
    readonly amountMinor: number | null;
    readonly description: string;
    readonly externalId?: string | null;
}

export type RowOutcome = { readonly row: ParsedRow } | { readonly rejection: Rejection };

function rejectionReason(draft: RowDraft, description: string): Rejection['reason'] | null {
    if (draft.date === null) {
        return REJECTION_REASONS.invalidDate;
    }
    if (draft.amountMinor === null) {
        return REJECTION_REASONS.invalidAmount;
    }
    if (draft.amountMinor === 0) {
        return REJECTION_REASONS.zeroAmount;
    }
    return description === '' ? REJECTION_REASONS.emptyDescription : null;
}

export function outcomeOf(draft: RowDraft): RowOutcome {
    const description: string = clip(draft.description, DESCRIPTION_MAX_LENGTH);
    const reason: Rejection['reason'] | null = rejectionReason(draft, description);
    if (reason !== null || draft.date === null || draft.amountMinor === null) {
        return { rejection: { line: draft.line, reason: reason ?? REJECTION_REASONS.invalidDate } };
    }
    return {
        row: {
            line: draft.line,
            date: draft.date,
            amountMinor: draft.amountMinor,
            description,
            externalId: draft.externalId ?? null
        }
    };
}

export interface StatementExtras {
    readonly currency?: string | null;
    readonly accountHint?: ParsedStatement['accountHint'];
    readonly columns?: readonly string[] | null;
    readonly pendingMappingRecords?: number | null;
}

export function statementOf(format: ImportFormat, drafts: readonly RowDraft[], extras: StatementExtras = {}): ParsedStatement {
    const outcomes: RowOutcome[] = drafts.map(outcomeOf);
    return {
        format,
        rows: outcomes.flatMap((outcome: RowOutcome): ParsedRow[] => ('row' in outcome ? [outcome.row] : [])),
        rejections: outcomes.flatMap((outcome: RowOutcome): Rejection[] => ('rejection' in outcome ? [outcome.rejection] : [])),
        currency: extras.currency ?? null,
        accountHint: extras.accountHint ?? null,
        columns: extras.columns ?? null,
        pendingMappingRecords: extras.pendingMappingRecords ?? null
    };
}

export function cellOf(record: CsvRecord, index: number | undefined): string {
    return index === undefined ? '' : (record.cells[index] ?? '').trim();
}

export function assertHeader(record: CsvRecord | undefined, expected: (cells: readonly string[]) => boolean): void {
    if (record === undefined || !expected(record.cells)) {
        throw new InvalidFileError(INVALID_FILE_REASONS.headerMismatch);
    }
}
