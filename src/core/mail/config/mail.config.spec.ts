import { afterEach, describe, expect, it, vi } from 'vitest';
import { mailConfig, MailConfig } from './mail.config';

describe('mailConfig', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('parses defaults when nothing is declared', () => {
        vi.stubEnv('MAIL_ALLOWED_RECIPIENTS', undefined);

        const config: MailConfig = mailConfig();

        expect(config.MAIL_DRIVER).toBe('smtp');
        expect(config.MAIL_ALLOWED_RECIPIENTS).toEqual([]);
    });

    it('splits and normalizes MAIL_ALLOWED_RECIPIENTS', () => {
        vi.stubEnv('MAIL_ALLOWED_RECIPIENTS', ' Ana@Cliente.com , @outraempresa.com,,');

        const config: MailConfig = mailConfig();

        expect(config.MAIL_ALLOWED_RECIPIENTS).toEqual(['ana@cliente.com', '@outraempresa.com']);
    });
});
