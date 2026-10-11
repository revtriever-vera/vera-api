import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoinGeckoQuoteDriver } from './coingecko-quote.driver';
import { FAKE_KEY, asset, budget, jsonResponse, testConfig } from './driver-test-support';

const BTC: ReturnType<typeof asset> = asset('bitcoin', 'CRYPTO', 'USD');
const ETH: ReturnType<typeof asset> = asset('ethereum', 'CRYPTO', 'USD');

describe('CoinGeckoQuoteDriver', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('quotes a whole batch in one call and dates it in UTC', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(
            jsonResponse({
                bitcoin: { usd: 62000.5, last_updated_at: 1_791_547_200 },
                ethereum: { usd: 2600, last_updated_at: 1_791_547_200 }
            })
        );
        vi.stubGlobal('fetch', fetchMock);
        const { service, reserve } = budget();
        const driver: CoinGeckoQuoteDriver = new CoinGeckoQuoteDriver(testConfig(), service);

        const result = await driver.fetchBatch([BTC, ETH]);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(reserve).toHaveBeenCalledTimes(1);
        expect(result.quotes).toEqual([
            { assetId: 'id-bitcoin', price: '62000.5', currency: 'USD', priceDate: '2026-10-09', source: 'coingecko' },
            { assetId: 'id-ethereum', price: '2600', currency: 'USD', priceDate: '2026-10-09', source: 'coingecko' }
        ]);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://coingecko.test/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_last_updated_at=true');
        expect(init.headers).toEqual({ 'x-cg-demo-api-key': FAKE_KEY });
    });

    it('fails the ids the provider did not answer or answered without a timestamp', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ bitcoin: { usd: 1 } })));
        const driver: CoinGeckoQuoteDriver = new CoinGeckoQuoteDriver(testConfig(), budget().service);

        const result = await driver.fetchBatch([BTC, ETH]);

        expect(result.failures).toEqual([
            { assetId: 'id-bitcoin', stage: 'parse', reason: 'market-data.provider_format_invalid' },
            { assetId: 'id-ethereum', stage: 'not_found', reason: 'market-data.symbol_unknown' }
        ]);
    });

    it('fails the whole batch on 429 and keeps small prices exact', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{}', { status: 429 })));
        const driver: CoinGeckoQuoteDriver = new CoinGeckoQuoteDriver(testConfig(), budget().service);

        const limited = await driver.fetchBatch([BTC, ETH]);

        expect(limited.failures.map((failure) => failure.reason)).toEqual([
            'market-data.provider_rate_limited',
            'market-data.provider_rate_limited'
        ]);

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ bitcoin: { usd: 0.00000123, last_updated_at: 1_791_547_200 } })));
        const small = await driver.fetchBatch([BTC]);
        expect(small.quotes[0]?.price).toBe('0.00000123');
    });

    it('fails the batch as budget when the budget refuses', async () => {
        const fetchMock: ReturnType<typeof vi.fn> = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const driver: CoinGeckoQuoteDriver = new CoinGeckoQuoteDriver(testConfig(), budget([false]).service);

        const result = await driver.fetchBatch([BTC, ETH]);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(result.failures.map((failure) => failure.stage)).toEqual(['budget', 'budget']);
    });

    it('rejects the call without a key and fails a malformed body', async () => {
        const keyless: CoinGeckoQuoteDriver = new CoinGeckoQuoteDriver(testConfig({ COINGECKO_API_KEY: '' }), budget().service);
        expect((await keyless.fetchBatch([BTC])).failures[0]?.reason).toBe('market-data.provider_rejected');

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([1, 2])));
        const driver: CoinGeckoQuoteDriver = new CoinGeckoQuoteDriver(testConfig(), budget().service);
        expect((await driver.fetchBatch([BTC])).failures[0]).toMatchObject({ stage: 'parse' });
    });
});
