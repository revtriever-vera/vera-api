import { afterEach, describe, expect, it } from 'vitest';
import { authConfig, AuthConfig } from './auth.config';

const ORIGINAL_ENV: NodeJS.ProcessEnv = { ...process.env };

describe('authConfig', () => {
    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    it('usa padrões seguros no ambiente local', () => {
        delete process.env['JWT_SECRET'];
        delete process.env['COOKIE_SECURE'];
        process.env['IS_LOCAL'] = 'true';

        const config: AuthConfig = authConfig();

        expect(config.ACCESS_TOKEN_TTL_MINUTES).toBe(10);
        expect(config.REFRESH_TOKEN_TTL_DAYS).toBe(30);
        expect(config.COOKIE_SECURE).toBe(false);
    });

    it('liga o cookie seguro por padrão fora do ambiente local', () => {
        process.env['IS_LOCAL'] = 'false';
        process.env['JWT_SECRET'] = 'x'.repeat(40);
        delete process.env['COOKIE_SECURE'];

        expect(authConfig().COOKIE_SECURE).toBe(true);
    });

    it('recusa o segredo de desenvolvimento fora do ambiente local', () => {
        delete process.env['IS_LOCAL'];
        process.env['JWT_SECRET'] = 'dev-secret-do-not-use-in-prod';

        expect(() => authConfig()).toThrow();
    });

    it('recusa segredo curto fora do ambiente local', () => {
        delete process.env['IS_LOCAL'];
        process.env['JWT_SECRET'] = 'curto';

        expect(() => authConfig()).toThrow();
    });
});
