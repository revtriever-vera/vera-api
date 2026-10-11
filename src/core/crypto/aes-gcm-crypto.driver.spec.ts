import { ConfigType } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { AesGcmCryptoDriver } from './aes-gcm-crypto.driver';
import { cryptoConfig } from './config/crypto.config';

function driverOf(keyHex: string): AesGcmCryptoDriver {
    const config: ConfigType<typeof cryptoConfig> = { CRYPTO_KEY_HEX: keyHex };
    return new AesGcmCryptoDriver(config);
}

const KEY_A: string = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
const KEY_B: string = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('AesGcmCryptoDriver', () => {
    it('decrypts exactly what it encrypted', () => {
        const driver: AesGcmCryptoDriver = driverOf(KEY_A);

        const cipher: string = driver.encrypt('super-secret-value');

        expect(driver.decrypt(cipher)).toBe('super-secret-value');
    });

    it('produces a different ciphertext each time, because the IV is random', () => {
        const driver: AesGcmCryptoDriver = driverOf(KEY_A);

        expect(driver.encrypt('same-plaintext')).not.toBe(driver.encrypt('same-plaintext'));
    });

    it('fails to decrypt with the wrong key, since the auth tag will not match', () => {
        const cipher: string = driverOf(KEY_A).encrypt('secret');

        expect(() => driverOf(KEY_B).decrypt(cipher)).toThrow();
    });

    it('round-trips an empty string', () => {
        const driver: AesGcmCryptoDriver = driverOf(KEY_A);

        expect(driver.decrypt(driver.encrypt(''))).toBe('');
    });
});
