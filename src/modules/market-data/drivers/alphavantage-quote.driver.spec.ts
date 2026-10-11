import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlphaVantageQuoteDriver } from './alphavantage-quote.driver';
import { asset, budget, jsonResponse, testConfig } from './driver-test-support';

const AAPL: ReturnType<typeof asset> = asset('AAPL', 'US', 'USD');

describe('AlphaVantageQuoteDriver', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reads the global quote price and latest trading day', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi
            .fn()
            .mockResolvedValue(
                jsonResponse({ 'Global Quote': { '01. symbol': 'AAPL', '05. price': '228.1200', '07. latest trading day': '2026-10-09' } })
            );
        vi.stubGlobal('fetch', fetchMock);
        const driver: AlphaVantageQuoteDriver = new AlphaVantageQuoteDriver(testConfig(), budget().service);

        const result = await driver.fetchBatch([AAPL]);

        expect(result.quotes).toEqual([
            { assetId: 'id-AAPL', price: '228.12', currency: 'USD', priceDate: '2026-10-09', source: 'alphavantage' }
        ]);
        expect((fetchMock.mock.calls[0] as [string])[0]).toContain('function=GLOBAL_QUOTE&symbol=AAPL');
    });

    it('treats an empty global quote as an unknown symbol', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ 'Global Quote': {} })));
        const driver: AlphaVantageQuoteDriver = new AlphaVantageQuoteDriver(testConfig(), budget().service);

        const result = await driver.fetchBatch([AAPL]);

        expect(result.failures).toEqual([{ assetId: 'id-AAPL', stage: 'not_found', reason: 'market-data.symbol_unknown' }]);
    });

    it('treats the throttling notice as rate limited, without echoing it', async () => {
        const notice: string = 'Thank you for using Alpha Vantage! secret-plan-details';
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ Information: notice })));
        const driver: AlphaVantageQuoteDriver = new AlphaVantageQuoteDriver(testConfig(), budget().service);

        const result = await driver.fetchBatch([AAPL]);

        expect(result.failures).toEqual([{ assetId: 'id-AAPL', stage: 'request', reason: 'market-data.provider_rate_limited' }]);
        expect(JSON.stringify(result)).not.toContain('secret-plan-details');
    });

    it('rejects the call without a key', async () => {
        const driver: AlphaVantageQuoteDriver = new AlphaVantageQuoteDriver(testConfig({ ALPHAVANTAGE_API_KEY: '' }), budget().service);

        const result = await driver.fetchBatch([AAPL]);

        expect(result.failures[0]?.reason).toBe('market-data.provider_rejected');
    });
});
