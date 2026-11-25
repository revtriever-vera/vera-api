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

export class ModelUnavailableError extends AppError {
    public constructor() {
        super({
            code: 'model.unavailable',
            status: 503,
            detail: 'No language model is configured: notes, statements and prints cannot be read; the B3 Excel report still works.'
        });
    }
}

export class ModelConfirmationRequiredError extends AppError {
    public constructor() {
        super({
            code: 'model.confirmation_required',
            status: 428,
            detail: 'The file would be sent to a language model: resend it with `modelConsent=true` after the person agrees.',
            meta: { sentTo: 'language_model', provider: 'vercel' }
        });
    }
}

export class ModelUnreadableError extends AppError {
    public constructor(reason: 'invalid_response' | 'no_operations' | 'positions_without_price') {
        super({
            code: 'model.unreadable',
            status: 422,
            detail: 'The file could not be read: try a sharper image or the PDF file.',
            meta: { reason }
        });
    }
}

export class FileTooManyPagesError extends AppError {
    public constructor(limit: number) {
        super({
            code: 'file.too_many_pages',
            status: 422,
            detail: 'The document has more pages than the reader accepts.',
            meta: { limit }
        });
    }
}

export class FileUnreadableError extends AppError {
    public constructor(reason: 'corrupt' | 'timeout' | 'too_much_text') {
        super({ code: 'file.unreadable', status: 422, detail: 'The file is damaged or too heavy to be read.', meta: { reason } });
    }
}
