import { afterEach, describe, expect, it, vi } from 'vitest';
import { FAKE_KEY, asset, budget, jsonResponse, testConfig } from './driver-test-support';
import { FinnhubQuoteDriver } from './finnhub-quote.driver';

const AAPL: ReturnType<typeof asset> = asset('AAPL', 'US', 'USD');

describe('FinnhubQuoteDriver', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reads the current price and dates it in the New York time zone', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi
            .fn()
            .mockResolvedValue(jsonResponse({ c: 228.12, d: -1.2, dp: -0.52, h: 230.1, l: 227.4, o: 229, pc: 227.5, t: 1_791_576_000 }));
        vi.stubGlobal('fetch', fetchMock);
        const driver: FinnhubQuoteDriver = new FinnhubQuoteDriver(testConfig(), budget().service);

        const result = await driver.fetchBatch([AAPL]);

        expect(result.quotes).toEqual([
            { assetId: 'id-AAPL', price: '228.12', currency: 'USD', priceDate: '2026-10-09', source: 'finnhub' }
        ]);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://finnhub.test/api/v1/quote?symbol=AAPL');
        expect(init.headers).toEqual({ 'X-Finnhub-Token': FAKE_KEY });
    });

    it('treats c = 0 and t = 0 as an unknown symbol', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 })));
        const driver: FinnhubQuoteDriver = new FinnhubQuoteDriver(testConfig(), budget().service);

        const result = await driver.fetchBatch([AAPL]);

        expect(result.quotes).toEqual([]);
        expect(result.failures).toEqual([{ assetId: 'id-AAPL', stage: 'not_found', reason: 'market-data.symbol_unknown' }]);
    });

    it('records one call of budget per symbol and keeps going after a failed symbol', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(new Response('x', { status: 500 }))
                .mockResolvedValueOnce(jsonResponse({ c: 430, t: 1_791_590_400 }))
        );
        const { service, reserve } = budget();
        const driver: FinnhubQuoteDriver = new FinnhubQuoteDriver(testConfig(), service);

        const result = await driver.fetchBatch([AAPL, asset('MSFT', 'US', 'USD')]);

        expect(reserve).toHaveBeenCalledTimes(2);
        expect(result.failures).toEqual([{ assetId: 'id-AAPL', stage: 'request', reason: 'market-data.provider_unavailable' }]);
        expect(result.quotes.map((quote) => quote.assetId)).toEqual(['id-MSFT']);
    });

    it('fails the rest of the chunk as budget when the provider budget is exhausted', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(jsonResponse({ c: 1, t: 1_791_590_400 }));
        vi.stubGlobal('fetch', fetchMock);
        const driver: FinnhubQuoteDriver = new FinnhubQuoteDriver(testConfig(), budget([false]).service);

        const result = await driver.fetchBatch([AAPL, asset('MSFT', 'US', 'USD')]);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(result.failures.map((failure) => failure.stage)).toEqual(['budget', 'budget']);
    });

    it('rejects the call without a key', async () => {
        const driver: FinnhubQuoteDriver = new FinnhubQuoteDriver(testConfig({ FINNHUB_API_KEY: '' }), budget().service);

        const result = await driver.fetchBatch([AAPL]);

        expect(result.failures[0]?.reason).toBe('market-data.provider_rejected');
    });

    it('fails a malformed body at the parse stage', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ c: 'x' })));
        const driver: FinnhubQuoteDriver = new FinnhubQuoteDriver(testConfig(), budget().service);

        const result = await driver.fetchBatch([AAPL]);

        expect(result.failures[0]).toMatchObject({ stage: 'parse' });
    });

    it('fails a body that is not JSON at the parse stage', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })));
        const driver: FinnhubQuoteDriver = new FinnhubQuoteDriver(testConfig(), budget().service);

        const result = await driver.fetchBatch([AAPL]);

        expect(result.failures[0]).toMatchObject({ stage: 'parse' });
    });
});
