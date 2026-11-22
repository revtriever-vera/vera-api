import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptoConfig, CryptoConfig } from './crypto.config';

describe('cryptoConfig', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('accepts the development default key when running locally', () => {
        vi.stubEnv('IS_LOCAL', 'true');
        vi.stubEnv('CRYPTO_KEY_HEX', undefined);

        const config: CryptoConfig = cryptoConfig();

        expect(config.CRYPTO_KEY_HEX).toHaveLength(64);
    });

    it('rejects the development default key outside of local', () => {
        vi.stubEnv('IS_LOCAL', 'false');
        vi.stubEnv('CRYPTO_KEY_HEX', undefined);

        expect(() => cryptoConfig()).toThrow();
    });

    it('accepts a valid 64-char hex key outside of local', () => {
        vi.stubEnv('IS_LOCAL', 'false');
        vi.stubEnv('CRYPTO_KEY_HEX', 'b'.repeat(64));

        const config: CryptoConfig = cryptoConfig();

        expect(config.CRYPTO_KEY_HEX).toBe('b'.repeat(64));
    });

    it('rejects a key that is not valid hex', () => {
        vi.stubEnv('IS_LOCAL', 'true');
        vi.stubEnv('CRYPTO_KEY_HEX', 'not-hex-at-all-not-hex-at-all-not-hex-at-all-not-hex-at-allxx');

        expect(() => cryptoConfig()).toThrow();
    });
});
