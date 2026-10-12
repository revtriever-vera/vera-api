import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrapiQuoteDriver } from './brapi-quote.driver';
import { FAKE_KEY, asset, budget, jsonResponse, testConfig } from './driver-test-support';

const SAMPLE: unknown = {
    results: [
        {
            symbol: 'ITUB4',
            shortName: 'ITUB4',
            currency: 'BRL',
            regularMarketPrice: 37.8,
            regularMarketDayHigh: 38.1,
            regularMarketChange: 0.5,
            regularMarketTime: '2026-10-09T21:31:30.000Z',
            marketCap: 400000000000,
            logourl: 'https://icons.example/ITUB4.svg'
        },
        {
            symbol: 'WEGE3',
            shortName: 'WEGE3',
            currency: 'BRL',
            regularMarketPrice: 52.1,
            regularMarketTime: '2026-10-09T21:31:30.000Z',
            marketCap: null
        }
    ],
    requestedAt: '2026-10-12T00:05:38.821Z',
    took: 0
};

describe('BrapiQuoteDriver', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reads the price as a decimal string and the date in the Sao Paulo time zone', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(jsonResponse(SAMPLE));
        vi.stubGlobal('fetch', fetchMock);
        const driver: BrapiQuoteDriver = new BrapiQuoteDriver(testConfig({ BRAPI_MAX_TICKERS_PER_REQUEST: '2' }), budget().service);

        const result = await driver.fetchBatch([asset('ITUB4'), asset('WEGE3')]);

        expect(result.failures).toEqual([]);
        expect(result.quotes).toEqual([
            { assetId: 'id-ITUB4', price: '37.8', currency: 'BRL', priceDate: '2026-10-09', source: 'brapi' },
            { assetId: 'id-WEGE3', price: '52.1', currency: 'BRL', priceDate: '2026-10-09', source: 'brapi' }
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://brapi.test/api/quote/ITUB4,WEGE3');
        expect(init.headers).toEqual({ Authorization: `Bearer ${FAKE_KEY}` });
    });

    it('splits the chunk into requests of the configured size, one budget call each', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockImplementation(async () => Promise.resolve(jsonResponse(SAMPLE)));
        vi.stubGlobal('fetch', fetchMock);
        const { service, reserve } = budget();
        const driver: BrapiQuoteDriver = new BrapiQuoteDriver(testConfig({ BRAPI_MAX_TICKERS_PER_REQUEST: '1' }), service);

        const result = await driver.fetchBatch([asset('ITUB4'), asset('WEGE3')]);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(reserve).toHaveBeenCalledTimes(2);
        expect(result.quotes.map((quote) => quote.assetId)).toEqual(['id-ITUB4', 'id-WEGE3']);
        expect(result.failures).toEqual([]);
    });

    it('maps the not found body of an unknown ticker to not_found', async () => {
        const body: unknown = { error: true, message: 'Nenhum resultado encontrado para os simbolos informados', code: 'NOT_FOUND' };
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body, 404)));
        const driver: BrapiQuoteDriver = new BrapiQuoteDriver(testConfig(), budget().service);

        const result = await driver.fetchBatch([asset('ZZZZ99')]);

        expect(result.failures).toEqual([{ assetId: 'id-ZZZZ99', stage: 'not_found', reason: 'market-data.symbol_unknown' }]);
    });

    it('rejects a request above the tickers per request of the plan', async () => {
        const body: unknown = {
            error: true,
            message: 'plan limit',
            code: 'QUOTES_PER_REQUEST_EXCEEDED',
            details: { limit: { current: 1, requested: 3 } }
        };
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body, 400)));
        const driver: BrapiQuoteDriver = new BrapiQuoteDriver(testConfig({ BRAPI_MAX_TICKERS_PER_REQUEST: '3' }), budget().service);

        const result = await driver.fetchBatch([asset('ITUB4'), asset('HGLG11'), asset('IVVB11')]);

        expect(result.failures.map((failure) => [failure.stage, failure.reason])).toEqual([
            ['request', 'market-data.provider_rejected'],
            ['request', 'market-data.provider_rejected'],
            ['request', 'market-data.provider_rejected']
        ]);
    });

    it('marks symbols missing from the response as not_found', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(SAMPLE)));
        const driver: BrapiQuoteDriver = new BrapiQuoteDriver(testConfig({ BRAPI_MAX_TICKERS_PER_REQUEST: '3' }), budget().service);

        const result = await driver.fetchBatch([asset('ITUB4'), asset('ZZZZ3')]);

        expect(result.quotes).toHaveLength(1);
        expect(result.failures).toEqual([{ assetId: 'id-ZZZZ3', stage: 'not_found', reason: 'market-data.symbol_unknown' }]);
    });

    it('fails a result without time or price at the right stage', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                jsonResponse({
                    results: [
                        { symbol: 'ITUB4', regularMarketPrice: 37.8 },
                        { symbol: 'WEGE3', regularMarketPrice: null, regularMarketTime: '2026-10-09T20:08:00.000Z' }
                    ]
                })
            )
        );
        const driver: BrapiQuoteDriver = new BrapiQuoteDriver(testConfig({ BRAPI_MAX_TICKERS_PER_REQUEST: '2' }), budget().service);

        const result = await driver.fetchBatch([asset('ITUB4'), asset('WEGE3')]);

        expect(result.failures).toEqual([
            { assetId: 'id-ITUB4', stage: 'parse', reason: 'market-data.provider_format_invalid' },
            { assetId: 'id-WEGE3', stage: 'not_found', reason: 'market-data.symbol_unknown' }
        ]);
    });

    it('turns 429 and 5xx into neutral request failures without the response body', async () => {
        const secret: string = 'body-with-sensitive-details';
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(new Response(secret, { status: 429 }))
                .mockResolvedValueOnce(new Response(secret, { status: 503 }))
        );
        const driver: BrapiQuoteDriver = new BrapiQuoteDriver(testConfig({ BRAPI_MAX_TICKERS_PER_REQUEST: '1' }), budget().service);

        const result = await driver.fetchBatch([asset('ITUB4'), asset('WEGE3')]);

        expect(result.failures).toEqual([
            { assetId: 'id-ITUB4', stage: 'request', reason: 'market-data.provider_rate_limited' },
            { assetId: 'id-WEGE3', stage: 'request', reason: 'market-data.provider_unavailable' }
        ]);
        expect(JSON.stringify(result)).not.toContain(secret);
    });

    it('turns a timeout into an unreachable failure', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')));
        const driver: BrapiQuoteDriver = new BrapiQuoteDriver(testConfig(), budget().service);

        const result = await driver.fetchBatch([asset('ITUB4')]);

        expect(result.failures).toEqual([{ assetId: 'id-ITUB4', stage: 'request', reason: 'market-data.provider_unreachable' }]);
    });

    it('stops calling the provider once the budget refuses and fails the rest as budget', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(jsonResponse(SAMPLE));
        vi.stubGlobal('fetch', fetchMock);
        const driver: BrapiQuoteDriver = new BrapiQuoteDriver(
            testConfig({ BRAPI_MAX_TICKERS_PER_REQUEST: '1' }),
            budget([true, false]).service
        );

        const result = await driver.fetchBatch([asset('ITUB4'), asset('WEGE3'), asset('PETR4')]);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result.failures.filter((failure) => failure.stage === 'budget').map((failure) => failure.assetId)).toEqual([
            'id-WEGE3',
            'id-PETR4'
        ]);
    });

    it('fails every asset as rejected when the token is missing', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const driver: BrapiQuoteDriver = new BrapiQuoteDriver(testConfig({ BRAPI_TOKEN: '' }), budget().service);

        const result = await driver.fetchBatch([asset('ITUB4')]);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(result.failures[0]?.reason).toBe('market-data.provider_rejected');
    });

    it('rejects a body that does not match the contract', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ unexpected: true })));
        const driver: BrapiQuoteDriver = new BrapiQuoteDriver(testConfig(), budget().service);

        const result = await driver.fetchBatch([asset('ITUB4')]);

        expect(result.failures[0]).toMatchObject({ stage: 'parse' });
    });
});
