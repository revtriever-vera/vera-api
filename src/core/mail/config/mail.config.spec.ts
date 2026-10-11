import { afterEach, describe, expect, it } from 'vitest';
import { mailConfig, MailConfig } from './mail.config';

const ORIGINAL_ENV: NodeJS.ProcessEnv = { ...process.env };

describe('mailConfig', () => {
    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    it('parses defaults when nothing is declared', () => {
        delete process.env['MAIL_ALLOWED_RECIPIENTS'];

        const config: MailConfig = mailConfig();

        expect(config.MAIL_DRIVER).toBe('smtp');
        expect(config.MAIL_ALLOWED_RECIPIENTS).toEqual([]);
    });

    it('splits and normalizes MAIL_ALLOWED_RECIPIENTS', () => {
        process.env['MAIL_ALLOWED_RECIPIENTS'] = ' Ana@Cliente.com , @outraempresa.com,,';

        const config: MailConfig = mailConfig();

        expect(config.MAIL_ALLOWED_RECIPIENTS).toEqual(['ana@cliente.com', '@outraempresa.com']);
    });
});
