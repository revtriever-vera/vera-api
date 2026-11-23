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

export class AlreadySubscribedError extends AppError {
    public constructor() {
        super({ code: 'billing.already_subscribed', status: 409, detail: 'This account already has the Premium plan.' });
    }
}

export class TrialRequiresCardError extends AppError {
    public constructor() {
        super({
            code: 'billing.trial_requires_card',
            status: 422,
            detail: 'The trial of this offer starts with a saved card; Pix is not accepted.'
        });
    }
}

export class NotResumableError extends AppError {
    public constructor() {
        super({ code: 'billing.not_resumable', status: 409, detail: 'There is no canceled subscription that can be resumed.' });
    }
}

export class NoSubscriptionError extends AppError {
    public constructor() {
        super({ code: 'billing.subscription_not_found', status: 404, detail: 'This account has no active subscription.' });
    }
}

export class InvoiceNotFoundError extends AppError {
    public constructor() {
        super({ code: 'billing.invoice_not_found', status: 404, detail: 'Invoice not found.' });
    }
}

export class WebhookUnauthorizedError extends AppError {
    public constructor() {
        super({ code: 'billing.webhook_unauthorized', status: 401, detail: 'The request could not be authenticated.' });
    }
}

export class InvalidEventError extends AppError {
    public constructor() {
        super({ code: 'billing.invalid_event', status: 400, detail: 'The event body is not valid.' });
    }
}

export class SubscriptionNotLinkedError extends AppError {
    public constructor() {
        super({ code: 'billing.subscription_not_linked', status: 404, detail: 'The subscription is not linked to an account.' });
    }
}

export class InvalidPriceRequestError extends AppError {
    public constructor() {
        super({ code: 'billing.invalid_price_request', status: 422, detail: 'The price request is not valid.' });
    }
}

export class UnknownPriceProductError extends AppError {
    public constructor() {
        super({ code: 'billing.unknown_price_product', status: 422, detail: 'The product is not priced by this system.' });
    }
}

export class FirstChargeAwaitingCardError extends AppError {
    public constructor() {
        super({ code: 'billing.first_charge_awaiting_card', status: 503, detail: 'The first charge waits for the card.' });
    }
}

export class SelfHostedNotAvailableError extends AppError {
    public constructor() {
        super({ code: 'billing.not_available', status: 409, detail: 'Subscriptions do not exist in a self-hosted installation.' });
    }
}
