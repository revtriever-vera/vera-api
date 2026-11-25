import { AppError } from '../../../shared/errors/app.error';

import { FormatSuggestion } from './investment-statement.types';

export class FormatNotRecognizedError extends AppError {
    public constructor(suggestion: FormatSuggestion | null) {
        super({
            code: 'format.not_recognized',
            status: 422,
            detail: 'The file is not a report the fixed reader knows.',
            meta: suggestion === null ? undefined : { suggestion }
        });
    }
}

export class ReportTooLargeError extends AppError {
    public constructor(limit: number) {
        super({
            code: 'format.too_many_rows',
            status: 422,
            detail: 'The report has more rows than the import limit.',
            meta: { limit }
        });
    }
}

export class FileRequiredError extends AppError {
    public constructor() {
        super({ code: 'file.required', status: 400, detail: 'The multipart field `file` is required.' });
    }
}

export class FileTooLargeError extends AppError {
    public constructor(limitBytes: number) {
        super({
            code: 'file.too_large',
            status: 413,
            detail: 'The report exceeds the size limit.',
            meta: { limitBytes }
        });
    }
}

export class PreviewExpiredError extends AppError {
    public constructor() {
        super({
            code: 'preview.expired',
            status: 410,
            detail: 'The preview expired or was already confirmed: send the file again.'
        });
    }
}

export class ImportUndoBlockedError extends AppError {
    public constructor(reason: 'later_import' | 'position_changed', cause: AppError) {
        super({
            code: 'import.undo_blocked',
            status: 409,
            detail: 'The import cannot be undone while later changes depend on it.',
            meta: { reason, ...cause.meta },
            cause
        });
    }
}

export class BlockedLinesError extends AppError {
    public constructor(lineIds: readonly string[], total: number) {
        super({
            code: 'import.has_blocked_lines',
            status: 422,
            detail: 'Fix or skip the blocked lines before confirming.',
            meta: { lineIds, total }
        });
    }
}

export class PositionModeRequiredError extends AppError {
    public constructor(lineIds: readonly string[], total: number) {
        super({
            code: 'import.position_mode_required',
            status: 422,
            detail: 'Choose add or history_only for the lines of assets that already have a position.',
            meta: { lineIds, total }
        });
    }
}

export class InvalidEditError extends AppError {
    public constructor(lineId: string, reason: 'unknown_line' | 'repeated_line') {
        super({
            code: 'import.invalid_edit',
            status: 422,
            detail: 'The edit does not match a line of the preview.',
            meta: { lineId, reason }
        });
    }
}

export class FixedIncomeIncompleteError extends AppError {
    public constructor(lineId: string, missing: readonly string[]) {
        super({
            code: 'import.fixed_income_incomplete',
            status: 422,
            detail: 'The fixed income title lacks fields: send them in `edits` or skip the line.',
            meta: { lineId, missing }
        });
    }
}

export class DuplicateTitleError extends AppError {
    public constructor(lineId: string) {
        super({
            code: 'import.fixed_income_duplicate',
            status: 422,
            detail: 'An equal title already exists: skip the line or send `edits` to create it anyway.',
            meta: { lineId }
        });
    }
}
