import { describe, expect, it } from 'vitest';
import { CryptoConfig } from './config/crypto.config';
import { HmacSha256Driver } from './hmac-sha256.driver';

function configOf(keyHex: string): CryptoConfig {
    return { CRYPTO_KEY_HEX: keyHex };
}

const KEY_A: string = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
const KEY_B: string = 'db78c6e8c4160e85f35ec7c3b59545da2c877fe8db5a0b61a586ce2352998f1';

describe('HmacSha256Driver', () => {
    it('produz o mesmo hash para o mesmo valor e a mesma chave', () => {
        const driver: HmacSha256Driver = new HmacSha256Driver(configOf(KEY_A));

        expect(driver.sha256Hex('ana-secret-value')).toBe(driver.sha256Hex('ana-secret-value'));
    });

    it('produz hashes diferentes para valores diferentes', () => {
        const driver: HmacSha256Driver = new HmacSha256Driver(configOf(KEY_A));

        expect(driver.sha256Hex('ana-secret-value')).not.toBe(driver.sha256Hex('bia-secret-value'));
    });

    it('produz hashes diferentes para chaves diferentes com o mesmo valor', () => {
        const driverA: HmacSha256Driver = new HmacSha256Driver(configOf(KEY_A));
        const driverB: HmacSha256Driver = new HmacSha256Driver(configOf(KEY_B));

        expect(driverA.sha256Hex('ana-secret-value')).not.toBe(driverB.sha256Hex('ana-secret-value'));
    });

    it('nunca devolve o valor original em claro', () => {
        const driver: HmacSha256Driver = new HmacSha256Driver(configOf(KEY_A));

        expect(driver.sha256Hex('ana-secret-value')).not.toContain('ana-secret-value');
    });
});
