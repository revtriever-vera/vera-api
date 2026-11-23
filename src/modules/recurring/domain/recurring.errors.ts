import { AppError } from '../../../shared/errors/app.error';

export class SeriesNotFoundError extends AppError {
    public constructor(seriesId: string) {
        super({ code: 'recurring.series_not_found', status: 404, detail: 'The recurring series does not exist.', meta: { seriesId } });
    }
}

export class InvalidSeriesStateError extends AppError {
    public constructor(seriesId: string, status: string, action: string) {
        super({
            code: 'recurring.invalid_state',
            status: 409,
            detail: 'The series is not in a state that allows this action.',
            meta: { seriesId, status, action }
        });
    }
}

export class ChargeNotInSeriesError extends AppError {
    public constructor(seriesId: string, transactionId: string) {
        super({
            code: 'recurring.charge_not_found',
            status: 404,
            detail: 'The transaction is not a charge of this series.',
            meta: { seriesId, transactionId }
        });
    }
}

export class RecurrenceTransactionNotFoundError extends AppError {
    public constructor(transactionId: string) {
        super({
            code: 'recurring.transaction_not_found',
            status: 404,
            detail: 'The transaction does not exist in this company.',
            meta: { transactionId }
        });
    }
}

export class RecurrenceNotEligibleError extends AppError {
    public constructor(transactionId: string) {
        super({
            code: 'recurring.transaction_not_eligible',
            status: 422,
            detail: 'Only a debit in BRL can start a recurring series.',
            meta: { transactionId }
        });
    }
}

export class SeriesLimitReachedError extends AppError {
    public constructor(limit: number) {
        super({
            code: 'recurring.limit_reached',
            status: 422,
            detail: 'The company reached the maximum number of recurring series.',
            meta: { limit }
        });
    }
}

export class RecurringCategoryKindError extends AppError {
    public constructor(categoryId: string) {
        super({
            code: 'recurring.category_kind_mismatch',
            status: 422,
            detail: 'A recurring charge is a debit, so its category must be an expense category.',
            meta: { categoryId }
        });
    }
}
