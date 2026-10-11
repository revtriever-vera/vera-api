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
