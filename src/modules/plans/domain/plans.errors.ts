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

export class TrialAlreadyUsedError extends AppError {
    public constructor() {
        super({
            code: 'billing.trial_already_used',
            status: 409,
            detail: 'This account already had its free trial.'
        });
    }
}

export class TrialUnavailableError extends AppError {
    public constructor() {
        super({
            code: 'billing.trial_unavailable',
            status: 409,
            detail: 'The account already has a Premium contract.'
        });
    }
}
