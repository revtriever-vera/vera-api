import { afterEach, describe, expect, it, vi } from 'vitest';
import { appConfig, AppConfig } from './app.config';

describe('appConfig', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('parses defaults when nothing is declared', () => {
        vi.stubEnv('IS_LOCAL', 'true');
        vi.stubEnv('DEPLOY_ENV', 'local');

        const config: AppConfig = appConfig();

        expect(config.PORT).toBe(3333);
        expect(config.LOG_LEVEL).toBe('info');
        expect(config.CORS_ORIGINS).toEqual([]);
    });

    it('splits and normalizes CORS_ORIGINS', () => {
        vi.stubEnv('IS_LOCAL', 'true');
        vi.stubEnv('DEPLOY_ENV', 'local');
        vi.stubEnv('CORS_ORIGINS', 'HTTPS://App.Example.com, https://other.example.com ,');

        const config: AppConfig = appConfig();

        expect(config.CORS_ORIGINS).toEqual(['https://app.example.com', 'https://other.example.com']);
    });

    it('fails fast when IS_LOCAL and DEPLOY_ENV disagree', () => {
        vi.stubEnv('IS_LOCAL', 'true');
        vi.stubEnv('DEPLOY_ENV', 'dev');

        expect(() => appConfig()).toThrow();
    });
});
