import { afterEach, describe, expect, it, vi } from 'vitest';
import { catalogConfig } from './catalog.config';

const KEYS: string[] = [
    'CATALOG_DRIVER',
    'B3_INSTRUMENTS_URL',
    'TESOURO_PRICES_CSV_URL',
    'FINNHUB_API_KEY',
    'FINNHUB_BASE_URL',
    'COINGECKO_API_KEY',
    'COINGECKO_BASE_URL',
    'CATALOG_HTTP_TIMEOUT_MS'
];

afterEach(() => {
    for (const key of KEYS) {
        vi.stubEnv(key, undefined);
    }
});

describe('catalogConfig', () => {
    it('defaults to the mock driver with no keys and the public base URLs', () => {
        const config = catalogConfig();

        expect(config.CATALOG_DRIVER).toBe('mock');
        expect(config.FINNHUB_API_KEY).toBeUndefined();
        expect(config.FINNHUB_BASE_URL).toBe('https://finnhub.io/api/v1');
        expect(config.COINGECKO_BASE_URL).toBe('https://api.coingecko.com/api/v3');
        expect(config.CATALOG_HTTP_TIMEOUT_MS).toBe(20000);
    });

    it('treats empty values like unset', () => {
        for (const key of KEYS) {
            vi.stubEnv(key, '  ');
        }

        const config = catalogConfig();

        expect(config.CATALOG_DRIVER).toBe('mock');
        expect(config.B3_INSTRUMENTS_URL).toBeUndefined();
        expect(config.TESOURO_PRICES_CSV_URL).toBeUndefined();
        expect(config.COINGECKO_API_KEY).toBeUndefined();
        expect(config.FINNHUB_BASE_URL).toBe('https://finnhub.io/api/v1');
    });

    it('reads the live configuration and accepts a dated URL template', () => {
        vi.stubEnv('CATALOG_DRIVER', 'live');
        vi.stubEnv('B3_INSTRUMENTS_URL', 'https://b3.example/{date}/instruments.csv');
        vi.stubEnv('FINNHUB_API_KEY', 'chave-falsa');
        vi.stubEnv('CATALOG_HTTP_TIMEOUT_MS', '5000');

        const config = catalogConfig();

        expect(config).toMatchObject({
            CATALOG_DRIVER: 'live',
            B3_INSTRUMENTS_URL: 'https://b3.example/{date}/instruments.csv',
            FINNHUB_API_KEY: 'chave-falsa',
            CATALOG_HTTP_TIMEOUT_MS: 5000
        });
    });

    it('rejects an invalid driver and an invalid URL', () => {
        vi.stubEnv('CATALOG_DRIVER', 'banana');
        expect(() => catalogConfig()).toThrow();

        vi.stubEnv('CATALOG_DRIVER', 'live');
        vi.stubEnv('B3_INSTRUMENTS_URL', 'nao-e-url');
        expect(() => catalogConfig()).toThrow();
    });
});
