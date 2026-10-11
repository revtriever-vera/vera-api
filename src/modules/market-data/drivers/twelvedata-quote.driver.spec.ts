import { afterEach, describe, expect, it, vi } from 'vitest';
import { FAKE_KEY, asset, budget, jsonResponse, testConfig } from './driver-test-support';
import { TwelveDataQuoteDriver } from './twelvedata-quote.driver';

const AAPL: ReturnType<typeof asset> = asset('AAPL', 'US', 'USD');

describe('TwelveDataQuoteDriver', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('keeps the close as an exact decimal string and the trading date as sent', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi
            .fn()
            .mockResolvedValue(jsonResponse({ symbol: 'AAPL', close: '228.12000', datetime: '2026-10-09' }));
        vi.stubGlobal('fetch', fetchMock);
        const driver: TwelveDataQuoteDriver = new TwelveDataQuoteDriver(testConfig(), budget().service);

        const result = await driver.fetchBatch([AAPL]);

        expect(result.quotes).toEqual([
            { assetId: 'id-AAPL', price: '228.12', currency: 'USD', priceDate: '2026-10-09', source: 'twelvedata' }
        ]);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://twelvedata.test/quote?symbol=AAPL');
        expect(init.headers).toEqual({ Authorization: `apikey ${FAKE_KEY}` });
    });

    it('maps the error codes of the body to the failure stages', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(jsonResponse({ status: 'error', code: 404 }))
                .mockResolvedValueOnce(jsonResponse({ status: 'error', code: 429 }))
                .mockResolvedValueOnce(jsonResponse({ status: 'error', code: 401 }))
        );
        const driver: TwelveDataQuoteDriver = new TwelveDataQuoteDriver(testConfig(), budget().service);

        const result = await driver.fetchBatch([AAPL, asset('MSFT', 'US', 'USD'), asset('KO', 'US', 'USD')]);

        expect(result.failures.map((failure) => [failure.stage, failure.reason])).toEqual([
            ['not_found', 'market-data.symbol_unknown'],
            ['request', 'market-data.provider_rate_limited'],
            ['request', 'market-data.provider_rejected']
        ]);
    });

    it('fails on a body outside the contract', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ close: 5 })));
        const driver: TwelveDataQuoteDriver = new TwelveDataQuoteDriver(testConfig(), budget().service);

        const result = await driver.fetchBatch([AAPL]);

        expect(result.failures[0]).toMatchObject({ stage: 'parse' });
    });

    it('rejects the call without a key', async () => {
        const driver: TwelveDataQuoteDriver = new TwelveDataQuoteDriver(testConfig({ TWELVEDATA_API_KEY: '' }), budget().service);

        const result = await driver.fetchBatch([AAPL]);

        expect(result.failures[0]?.reason).toBe('market-data.provider_rejected');
    });
});
