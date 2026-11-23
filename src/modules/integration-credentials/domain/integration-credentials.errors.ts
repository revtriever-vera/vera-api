import { AppError } from '../../../shared/errors/app.error';
import { TestFailureReason } from './integration.types';

export class IntegrationTestFailedError extends AppError {
    public readonly reason: TestFailureReason;

    public constructor(reason: TestFailureReason) {
        super({
            code: 'integrations.test_failed',
            status: 422,
            detail: 'The provider rejected the integration test. Nothing was saved.',
            meta: { reason }
        });
        this.reason = reason;
    }
}

export class PhoneNumberInUseError extends AppError {
    public constructor() {
        super({
            code: 'integrations.phone_in_use',
            status: 409,
            detail: 'This WhatsApp number is already linked to another account.'
        });
    }
}

export class IntegrationsUnavailableError extends AppError {
    public constructor() {
        super({
            code: 'integrations.not_available',
            status: 404,
            detail: 'Integrations are managed by the instance in the hosted deployment.'
        });
    }
}

export class IntegrationUnreadableError extends AppError {
    public constructor() {
        super({
            code: 'integrations.secret_unreadable',
            status: 500,
            detail: 'The stored integration secret could not be opened.'
        });
    }
}

export class SecretSafeValidationError extends AppError {
    public constructor(errors: readonly { readonly path: string; readonly code: string }[]) {
        super({
            code: 'validation_failed',
            status: 400,
            detail: 'Validation failed.',
            meta: { errors }
        });
    }
}
