import { AppError } from '../../../shared/errors/app.error';

export class TitleNotFoundError extends AppError {
    public constructor(titleId: string) {
        super({
            code: 'fixed_income.title_not_found',
            status: 404,
            detail: 'The fixed income security does not exist.',
            meta: { titleId }
        });
    }
}

export class AppliedDateOutOfRangeError extends AppError {
    public constructor(minDate: string) {
        super({
            code: 'fixed_income.applied_date_out_of_range',
            status: 422,
            detail: 'The application date must be between the start of the index series and today.',
            meta: { minDate }
        });
    }
}

export class InvalidTermsError extends AppError {
    public constructor(reason: string) {
        super({
            code: 'fixed_income.invalid_terms',
            status: 422,
            detail: 'The terms of the security are inconsistent with each other.',
            meta: { reason }
        });
    }
}

export class TitleLimitReachedError extends AppError {
    public constructor(limit: number) {
        super({
            code: 'fixed_income.limit_reached',
            status: 422,
            detail: 'The company reached the maximum number of fixed income securities.',
            meta: { limit }
        });
    }
}

export class IndexSourceError extends AppError {
    public constructor(series: string, reason: string, cause?: unknown) {
        super({
            code: 'fixed_income.index_source_unavailable',
            status: 502,
            detail: 'The index series source did not return usable data.',
            meta: { series, reason },
            cause
        });
    }
}
