import { AppError } from '../../shared/errors/app.error';

export class CapReachedError extends AppError {
    public constructor(feature: string, resetsAt: string | null) {
        super({
            code: 'usage.cap_reached',
            status: 429,
            detail: 'The monthly paid usage cap was reached; paid features resume when the month turns.',
            meta: { feature, resetsAt }
        });
    }
}

export class UsdRateUnavailableError extends AppError {
    public constructor() {
        super({ code: 'usage.rate_unavailable', status: 503, detail: 'No recent USD exchange rate is available.' });
    }
}

export class SendPriceUnavailableError extends AppError {
    public constructor(category: string) {
        super({
            code: 'usage.price_unavailable',
            status: 503,
            detail: 'The send price table has no entry for this category.',
            meta: { category }
        });
    }
}

export class InvalidUsageDetailError extends AppError {
    public constructor(cause: unknown) {
        super({ code: 'usage.invalid_detail', status: 500, detail: 'The usage detail has keys outside the fixed schema.', cause });
    }
}
