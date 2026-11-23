import { AppError } from '../../../shared/errors/app.error';

export class PremiumRequiredError extends AppError {
    public constructor(feature: string) {
        super({
            code: 'billing.premium_required',
            status: 402,
            detail: 'This feature is part of the Premium plan.',
            meta: { feature }
        });
    }
}

export class FeatureDisabledError extends AppError {
    public constructor(feature: string) {
        super({
            code: 'billing.feature_disabled',
            status: 503,
            detail: 'This feature is not available in this installation.',
            meta: { feature }
        });
    }
}

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

export class BillingNotAvailableError extends AppError {
    public constructor() {
        super({
            code: 'billing.not_available',
            status: 409,
            detail: 'Subscriptions do not exist in a self-hosted installation.'
        });
    }
}

export class PlanUnavailableError extends AppError {
    public constructor(cause: unknown) {
        super({
            code: 'billing.feature_disabled',
            status: 503,
            detail: 'The plan of this account could not be read.',
            cause
        });
    }
}
