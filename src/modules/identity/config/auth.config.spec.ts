import { afterEach, describe, expect, it, vi } from 'vitest';
import { authConfig, AuthConfig } from './auth.config';

describe('authConfig', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('usa padrões seguros no ambiente local', () => {
        vi.stubEnv('JWT_SECRET', undefined);
        vi.stubEnv('COOKIE_SECURE', undefined);
        vi.stubEnv('IS_LOCAL', 'true');

        const config: AuthConfig = authConfig();

        expect(config.ACCESS_TOKEN_TTL_MINUTES).toBe(10);
        expect(config.REFRESH_TOKEN_TTL_DAYS).toBe(30);
        expect(config.COOKIE_SECURE).toBe(false);
    });

    it('liga o cookie seguro por padrão fora do ambiente local', () => {
        vi.stubEnv('IS_LOCAL', 'false');
        vi.stubEnv('JWT_SECRET', 'x'.repeat(40));
        vi.stubEnv('COOKIE_SECURE', undefined);

        expect(authConfig().COOKIE_SECURE).toBe(true);
    });

    it('recusa o segredo de desenvolvimento fora do ambiente local', () => {
        vi.stubEnv('IS_LOCAL', undefined);
        vi.stubEnv('JWT_SECRET', 'dev-secret-do-not-use-in-prod');

        expect(() => authConfig()).toThrow();
    });

    it('recusa segredo curto fora do ambiente local', () => {
        vi.stubEnv('IS_LOCAL', undefined);
        vi.stubEnv('JWT_SECRET', 'curto');

        expect(() => authConfig()).toThrow();
    });

    it('deixa os provedores sociais desligados por padrão', () => {
        vi.stubEnv('IS_LOCAL', 'true');
        vi.stubEnv('GOOGLE_CLIENT_ID', undefined);
        vi.stubEnv('FACEBOOK_APP_ID', undefined);
        vi.stubEnv('FACEBOOK_APP_SECRET', undefined);
        vi.stubEnv('FACEBOOK_GRAPH_VERSION', undefined);

        const config: AuthConfig = authConfig();

        expect(config.GOOGLE_CLIENT_ID).toBe('');
        expect(config.FACEBOOK_APP_ID).toBe('');
        expect(config.FACEBOOK_GRAPH_VERSION).toMatch(/^v\d+\.\d+$/);
    });

    it('exige o segredo do app quando o app id do Facebook está preenchido', () => {
        vi.stubEnv('IS_LOCAL', 'true');
        vi.stubEnv('FACEBOOK_APP_ID', 'fake-app-id');
        vi.stubEnv('FACEBOOK_APP_SECRET', undefined);

        expect(() => authConfig()).toThrow('FACEBOOK_APP_SECRET');

        vi.stubEnv('FACEBOOK_APP_SECRET', 'fake-app-secret');
        expect(authConfig().FACEBOOK_APP_SECRET).toBe('fake-app-secret');
    });

    it('trata valor em branco do Facebook como não configurado', () => {
        vi.stubEnv('IS_LOCAL', 'true');
        vi.stubEnv('FACEBOOK_APP_ID', '   ');
        vi.stubEnv('FACEBOOK_APP_SECRET', ' ');

        const config: AuthConfig = authConfig();

        expect(config.FACEBOOK_APP_ID).toBe('');
        expect(config.FACEBOOK_APP_SECRET).toBe('');
    });

    it('apara o id e o segredo do Facebook e exige o segredo sobre o valor aparado', () => {
        vi.stubEnv('IS_LOCAL', 'true');
        vi.stubEnv('FACEBOOK_APP_ID', ' fake-app-id ');
        vi.stubEnv('FACEBOOK_APP_SECRET', '  ');

        expect(() => authConfig()).toThrow('FACEBOOK_APP_SECRET');

        vi.stubEnv('FACEBOOK_APP_SECRET', ' fake-app-secret ');
        const config: AuthConfig = authConfig();

        expect(config.FACEBOOK_APP_ID).toBe('fake-app-id');
        expect(config.FACEBOOK_APP_SECRET).toBe('fake-app-secret');
    });

    it('recusa versão da Graph API fora do formato vN.M', () => {
        vi.stubEnv('IS_LOCAL', 'true');
        vi.stubEnv('FACEBOOK_GRAPH_VERSION', '23');

        expect(() => authConfig()).toThrow();
    });
});
