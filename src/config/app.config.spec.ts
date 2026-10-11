import { afterEach, describe, expect, it } from 'vitest';
import { appConfig, AppConfig } from './app.config';

const ORIGINAL_ENV: NodeJS.ProcessEnv = { ...process.env };

describe('appConfig', () => {
    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    it('parses defaults when nothing is declared', () => {
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';

        const config: AppConfig = appConfig();

        expect(config.PORT).toBe(3333);
        expect(config.LOG_LEVEL).toBe('info');
        expect(config.CORS_ORIGINS).toEqual([]);
    });

    it('splits and normalizes CORS_ORIGINS', () => {
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'local';
        process.env['CORS_ORIGINS'] = 'HTTPS://App.Example.com, https://other.example.com ,';

        const config: AppConfig = appConfig();

        expect(config.CORS_ORIGINS).toEqual(['https://app.example.com', 'https://other.example.com']);
    });

    it('fails fast when IS_LOCAL and DEPLOY_ENV disagree', () => {
        process.env['IS_LOCAL'] = 'true';
        process.env['DEPLOY_ENV'] = 'dev';

        expect(() => appConfig()).toThrow();
    });
});
