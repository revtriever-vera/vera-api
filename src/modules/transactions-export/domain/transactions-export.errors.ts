import { AppError } from '../../../shared/errors/app.error';

export class ExportTooLargeError extends AppError {
    public constructor(rows: number, limit: number) {
        super({
            code: 'transactions.export_too_large',
            status: 422,
            detail: 'The filter matches more transactions than a single export can hold. Choose a shorter period.',
            meta: { rows, limit }
        });
    }
}
