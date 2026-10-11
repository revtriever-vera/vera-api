import { AppError } from '../../../shared/errors/app.error';

export class UnauthorizedError extends AppError {
    public constructor() {
        super({
            code: 'identity.unauthorized',
            status: 401,
            detail: 'Missing or invalid access token.'
        });
    }
}

export class InvalidRefreshTokenError extends AppError {
    public constructor() {
        super({
            code: 'identity.invalid_refresh',
            status: 401,
            detail: 'The refresh token is missing, expired, revoked or was already rotated.'
        });
    }
}

export class ReusedRefreshTokenError extends InvalidRefreshTokenError {
    public constructor() {
        super();
        this.name = InvalidRefreshTokenError.name;
    }
}

export class AccountClosedError extends AppError {
    public constructor(companyId: string) {
        super({
            code: 'identity.account_closed',
            status: 401,
            detail: 'The company or the user that owns this account no longer exists.',
            meta: { companyId }
        });
    }
}

export class InvalidGoogleTokenError extends AppError {
    public constructor() {
        super({
            code: 'identity.invalid_google_token',
            status: 401,
            detail: 'The Google ID token is invalid, expired, issued for another client or carries an unverified email.'
        });
    }
}

export class InvalidFacebookTokenError extends AppError {
    public constructor() {
        super({
            code: 'identity.invalid_facebook_token',
            status: 401,
            detail: 'The Facebook access token is invalid, expired or was issued for another app.'
        });
    }
}

export class ProviderDisabledError extends AppError {
    public constructor(provider: string) {
        super({
            code: 'identity.provider_disabled',
            status: 503,
            detail: `Sign-in with ${provider} is not configured in this environment.`,
            meta: { provider }
        });
    }
}

export class ProviderUnavailableError extends AppError {
    public constructor(provider: string) {
        super({
            code: 'identity.provider_unavailable',
            status: 502,
            detail: `The ${provider} verification endpoint did not answer in time or failed.`,
            meta: { provider }
        });
    }
}

export class EmailNotProvidedError extends AppError {
    public constructor(provider: string) {
        super({
            code: 'identity.email_not_provided',
            status: 422,
            detail: `The ${provider} account did not share an email address, which is required to create the account.`,
            meta: { provider }
        });
    }
}

export class EmailInUseError extends AppError {
    public constructor() {
        super({
            code: 'identity.email_in_use',
            status: 409,
            detail: 'An account with this email already exists and the sign-in method cannot be linked to it automatically.'
        });
    }
}

export class ForbiddenError extends AppError {
    public constructor() {
        super({
            code: 'identity.forbidden',
            status: 403,
            detail: 'Only the owner of the company can perform this action.'
        });
    }
}

export class ConfirmationMismatchError extends AppError {
    public constructor() {
        super({
            code: 'identity.confirmation_mismatch',
            status: 422,
            detail: 'The email typed to confirm does not match the email of the signed-in user.'
        });
    }
}

export class AccountErasureFailedError extends AppError {
    public constructor(area: string, cause: unknown) {
        super({
            code: 'identity.erasure_failed',
            status: 500,
            detail: `Erasing the data of area "${area}" failed; nothing was deleted from the database.`,
            meta: { area },
            cause
        });
    }
}

export class AccountExportFailedError extends AppError {
    public constructor(area: string, cause: unknown) {
        super({
            code: 'identity.export_failed',
            status: 500,
            detail: `Exporting the data of area "${area}" failed; no partial file was produced.`,
            meta: { area },
            cause
        });
    }
}
