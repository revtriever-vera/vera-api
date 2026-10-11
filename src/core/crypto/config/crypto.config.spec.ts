import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cryptoConfig, CryptoConfig } from './crypto.config';

const ORIGINAL_ENV: NodeJS.ProcessEnv = { ...process.env };

describe('cryptoConfig', () => {
    beforeEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
    });

    it('accepts the development default key when running locally', () => {
        process.env['IS_LOCAL'] = 'true';
        delete process.env['CRYPTO_KEY_HEX'];

        const config: CryptoConfig = cryptoConfig();

        expect(config.CRYPTO_KEY_HEX).toHaveLength(64);
    });

    it('rejects the development default key outside of local', () => {
        process.env['IS_LOCAL'] = 'false';
        delete process.env['CRYPTO_KEY_HEX'];

        expect(() => cryptoConfig()).toThrow();
    });

    it('accepts a valid 64-char hex key outside of local', () => {
        process.env['IS_LOCAL'] = 'false';
        process.env['CRYPTO_KEY_HEX'] = 'b'.repeat(64);

        const config: CryptoConfig = cryptoConfig();

        expect(config.CRYPTO_KEY_HEX).toBe('b'.repeat(64));
    });

    it('rejects a key that is not valid hex', () => {
        process.env['IS_LOCAL'] = 'true';
        process.env['CRYPTO_KEY_HEX'] = 'not-hex-at-all-not-hex-at-all-not-hex-at-all-not-hex-at-allxx';

        expect(() => cryptoConfig()).toThrow();
    });
});
