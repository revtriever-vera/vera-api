import { AppError } from '../../../shared/errors/app.error';

export class InvalidPluggyCredentialsError extends AppError {
    public constructor() {
        super({
            code: 'connections.invalid_credentials',
            status: 422,
            detail: 'Pluggy rejected the client credentials.'
        });
    }
}

export class PluggyProviderUnavailableError extends AppError {
    public constructor(retryAfterSeconds: number | null) {
        super({
            code: 'connections.provider_unavailable',
            status: 502,
            detail: 'Pluggy is unavailable right now.',
            meta: retryAfterSeconds === null ? undefined : { retryAfterSeconds }
        });
    }
}

export class ProviderDisabledError extends AppError {
    public constructor() {
        super({
            code: 'connections.provider_disabled',
            status: 503,
            detail: 'The Pluggy integration is not enabled in this environment.'
        });
    }
}

export class CredentialsMissingError extends AppError {
    public constructor() {
        super({
            code: 'connections.credentials_missing',
            status: 422,
            detail: 'The company has no Pluggy credentials saved.'
        });
    }
}

export class ConnectionNotFoundError extends AppError {
    public constructor(connectionId: string) {
        super({
            code: 'connections.connection_not_found',
            status: 404,
            detail: 'The bank connection does not exist.',
            meta: { connectionId }
        });
    }
}

export class SyncInProgressError extends AppError {
    public constructor(connectionId: string) {
        super({
            code: 'connections.sync_in_progress',
            status: 409,
            detail: 'A synchronization is already running for this connection.',
            meta: { connectionId }
        });
    }
}

export class ItemNotFoundError extends AppError {
    public constructor(connectionId: string) {
        super({
            code: 'connections.item_not_found',
            status: 422,
            detail: 'The item no longer exists at Pluggy. Authorize it again and connect the new Item ID.',
            meta: { connectionId }
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
