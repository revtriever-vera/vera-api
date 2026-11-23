import { AppError } from '../../../shared/errors/app.error';

export type EngineFailureReason =
    | 'unreachable'
    | 'timeout'
    | 'rate_limited'
    | 'server_error'
    | 'format_invalid'
    | 'unexpected_status'
    | 'idempotency_in_progress'
    | 'forced_failure';

export class BillingEngineUnavailableError extends AppError {
    public readonly reason: EngineFailureReason;
    public readonly httpStatus: number | null;

    public constructor(reason: EngineFailureReason, httpStatus: number | null) {
        super({
            code: 'billing.provider_unavailable',
            status: 503,
            detail: 'The billing provider is unavailable.',
            meta: { reason }
        });
        this.reason = reason;
        this.httpStatus = httpStatus;
    }
}

export class BillingEngineRejectedError extends AppError {
    public readonly problemType: string | null;
    public readonly httpStatus: number;

    public constructor(httpStatus: number, problemType: string | null) {
        super({
            code: 'billing.engine_rejected',
            status: 502,
            detail: 'The billing provider rejected the request.'
        });
        this.problemType = problemType;
        this.httpStatus = httpStatus;
    }
}

export class BillingProviderDisabledError extends AppError {
    public constructor() {
        super({
            code: 'billing.provider_disabled',
            status: 503,
            detail: 'The billing provider is not configured in this environment.'
        });
    }
}

export class BillingDevPageNotFoundError extends AppError {
    public constructor() {
        super({ code: 'billing.dev_page_not_found', status: 404, detail: 'Not found.' });
    }
}
