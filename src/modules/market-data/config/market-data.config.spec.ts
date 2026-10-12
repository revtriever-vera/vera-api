import { describe, expect, it } from 'vitest';
import { limitVariable, parseMarketDataConfig } from './market-data.config';

describe('parseMarketDataConfig', () => {
    it('defaults to the mock driver when no key is configured', () => {
        const config = parseMarketDataConfig({});

        expect(config.DRIVER).toBe('mock');
        expect(config.US_QUOTE_PROVIDERS).toEqual(['finnhub', 'twelvedata', 'alphavantage']);
        expect(config.MARKET_DATA_HTTP_TIMEOUT_MS).toBe(8000);
        expect(config.BRAPI_MAX_TICKERS_PER_REQUEST).toBe(1);
    });

    it('goes live when any key is configured and respects an explicit driver', () => {
        expect(parseMarketDataConfig({ BRAPI_TOKEN: 'k' }).DRIVER).toBe('live');
        expect(parseMarketDataConfig({ BRAPI_TOKEN: 'k', MARKET_DATA_DRIVER: 'mock' }).DRIVER).toBe('mock');
        expect(parseMarketDataConfig({ MARKET_DATA_DRIVER: 'live' }).DRIVER).toBe('live');
    });

    it('treats blank values as unset', () => {
        const config = parseMarketDataConfig({ BRAPI_TOKEN: '  ', FINNHUB_API_KEY: '', FINNHUB_LIMIT_MINUTE: ' ' });

        expect(config.BRAPI_TOKEN).toBeUndefined();
        expect(config.DRIVER).toBe('mock');
        expect(config.LIMITS.finnhub).toEqual({ minute: 50 });
    });

    it('treats the unset placeholder as no key', () => {
        const config = parseMarketDataConfig({ TWELVEDATA_API_KEY: 'unset', ALPHAVANTAGE_API_KEY: 'UNSET' });

        expect(config.TWELVEDATA_API_KEY).toBeUndefined();
        expect(config.ALPHAVANTAGE_API_KEY).toBeUndefined();
        expect(config.DRIVER).toBe('mock');
    });

    it('defaults the budgets to the free plan limits', () => {
        const config = parseMarketDataConfig({});

        expect(config.LIMITS.brapi).toEqual({ month: 15_000 });
        expect(config.LIMITS.twelvedata).toEqual({ minute: 8, day: 800 });
        expect(config.LIMITS.alphavantage).toEqual({ day: 25 });
        expect(config.LIMITS.coingecko).toEqual({ minute: 100, month: 10_000 });
    });

    it('reads the budget limits from the environment over the defaults', () => {
        const config = parseMarketDataConfig({ FINNHUB_LIMIT_MINUTE: '30', COINGECKO_LIMIT_DAY: '100' });

        expect(config.LIMITS.finnhub).toEqual({ minute: 30 });
        expect(config.LIMITS.coingecko).toEqual({ minute: 100, day: 100, month: 10_000 });
        expect(config.LIMITS.tesouro).toEqual({});
        expect(limitVariable('alphavantage', 'day')).toBe('ALPHAVANTAGE_LIMIT_DAY');
    });

    it('keeps the US provider order from the variable and drops unknown names', () => {
        expect(parseMarketDataConfig({ US_QUOTE_PROVIDERS: 'twelvedata, finnhub,bogus' }).US_QUOTE_PROVIDERS).toEqual([
            'twelvedata',
            'finnhub'
        ]);
    });

    it('rejects invalid numbers and urls', () => {
        expect(() => parseMarketDataConfig({ FINNHUB_LIMIT_MINUTE: 'abc' })).toThrow();
        expect(() => parseMarketDataConfig({ BRAPI_BASE_URL: 'not a url' })).toThrow();
    });
});
