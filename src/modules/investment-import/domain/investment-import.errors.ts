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
