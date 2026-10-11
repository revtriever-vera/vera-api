import { describe, expect, it } from 'vitest';
import { AccountClosedError, InvalidRefreshTokenError, ReusedRefreshTokenError, UnauthorizedError } from './identity.errors';

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
});
