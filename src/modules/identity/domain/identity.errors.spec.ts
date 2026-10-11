import { describe, expect, it } from 'vitest';
import {
    AccountClosedError,
    EmailInUseError,
    EmailNotProvidedError,
    InvalidFacebookTokenError,
    InvalidGoogleTokenError,
    InvalidRefreshTokenError,
    ProviderDisabledError,
    ProviderUnavailableError,
    ReusedRefreshTokenError,
    UnauthorizedError
} from './identity.errors';

describe('identity errors', () => {
    it('expõe códigos e status estáveis', () => {
        expect(new UnauthorizedError()).toMatchObject({ code: 'identity.unauthorized', status: 401 });
        expect(new InvalidRefreshTokenError()).toMatchObject({ code: 'identity.invalid_refresh', status: 401 });
        expect(new AccountClosedError('company-1')).toMatchObject({ code: 'identity.account_closed', status: 401 });
    });

    it('o reuso é indistinguível do refresh inválido para quem chama', () => {
        const reused: ReusedRefreshTokenError = new ReusedRefreshTokenError();

        expect(reused).toBeInstanceOf(InvalidRefreshTokenError);
        expect(reused.code).toBe('identity.invalid_refresh');
        expect(reused.name).toBe('InvalidRefreshTokenError');
    });

    it('expõe os códigos do login social', () => {
        expect(new InvalidGoogleTokenError()).toMatchObject({ code: 'identity.invalid_google_token', status: 401 });
        expect(new InvalidFacebookTokenError()).toMatchObject({ code: 'identity.invalid_facebook_token', status: 401 });
        expect(new ProviderDisabledError('google')).toMatchObject({ code: 'identity.provider_disabled', status: 503 });
        expect(new ProviderUnavailableError('facebook')).toMatchObject({ code: 'identity.provider_unavailable', status: 502 });
        expect(new EmailNotProvidedError('facebook')).toMatchObject({ code: 'identity.email_not_provided', status: 422 });
        expect(new EmailInUseError()).toMatchObject({ code: 'identity.email_in_use', status: 409 });
    });
});
