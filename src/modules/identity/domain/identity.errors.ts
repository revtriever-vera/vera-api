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

export class RoleForbiddenError extends AppError {
    public constructor(required: string) {
        super({
            code: 'members.forbidden_role',
            status: 403,
            detail: `This action requires the ${required} role or higher.`,
            meta: { required }
        });
    }
}

export class RouteRoleMissingError extends AppError {
    public constructor(route: string) {
        super({
            code: 'core.route_role_missing',
            status: 500,
            detail: 'A write route reached the roles guard without a declared required role.',
            meta: { route }
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

export class AccountModulesEmptyError extends AppError {
    public constructor() {
        super({
            code: 'account.modules_empty',
            status: 422,
            detail: 'At least one module (portfolio or spending) must stay enabled.'
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

export class PlatformOnlyError extends AppError {
    public constructor() {
        super({
            code: 'identity.platform_only',
            status: 403,
            detail: 'This area is restricted to the people of the platform company.'
        });
    }
}

export class PlatformDisabledError extends AppError {
    public constructor() {
        super({
            code: 'identity.platform_disabled',
            status: 404,
            detail: 'The platform admin does not exist in this deployment.'
        });
    }
}

export class AdminAudienceRequiredError extends AppError {
    public constructor() {
        super({
            code: 'identity.admin_audience_required',
            status: 403,
            detail: 'People of the platform company sign in through the admin audience only.'
        });
    }
}

export class PlatformCompanyProtectedError extends AppError {
    public constructor() {
        super({
            code: 'identity.platform_company_protected',
            status: 403,
            detail: 'The platform company cannot be deleted.'
        });
    }
}

export class PlatformSeedRefusedError extends AppError {
    public constructor(reason: string) {
        super({
            code: 'identity.platform_seed_refused',
            status: 409,
            detail: `The platform seed cannot run: ${reason}.`,
            meta: { reason }
        });
    }
}

export class SecondFactorRequiredError extends AppError {
    public constructor() {
        super({
            code: 'identity.second_factor_required',
            status: 403,
            detail: 'A platform session is only issued after the second factor.'
        });
    }
}

export class InvalidTotpTokenError extends AppError {
    public constructor() {
        super({
            code: 'identity.invalid_totp_token',
            status: 401,
            detail: 'The challenge or enrollment token is missing, expired or not valid for this step.'
        });
    }
}

export class InvalidTotpCodeError extends AppError {
    public constructor() {
        super({
            code: 'identity.invalid_totp_code',
            status: 401,
            detail: 'The authenticator code or the recovery code is not valid.'
        });
    }
}

export class TotpNotEnrolledError extends AppError {
    public constructor() {
        super({
            code: 'identity.totp_not_enrolled',
            status: 409,
            detail: 'There is no authenticator waiting for activation or active for this person.'
        });
    }
}

export class TotpAlreadyActiveError extends AppError {
    public constructor() {
        super({
            code: 'identity.totp_already_active',
            status: 409,
            detail: 'This person already has an active authenticator; it is only reset through the platform seed.'
        });
    }
}

export class PlatformTokenNotFoundError extends AppError {
    public constructor() {
        super({
            code: 'identity.platform_token_not_found',
            status: 404,
            detail: 'There is no platform token with this id.'
        });
    }
}
