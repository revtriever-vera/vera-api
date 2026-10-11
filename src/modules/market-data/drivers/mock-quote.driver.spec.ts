import { describe, expect, it, vi } from 'vitest';
import { MOCK_USD_RATE, MockExchangeRateDriver } from './mock-exchange-rate.driver';
import { MOCK_PRICES, MockQuoteDriver, mockPriceOf } from './mock-quote.driver';
import { asset } from './driver-test-support';

describe('mock drivers', () => {
    it('returns the fixed prices of the sample portfolio', async () => {
        const result = await new MockQuoteDriver('brapi').fetchBatch([asset('ITUB4'), asset('HGLG11')]);

        expect(result.quotes.map((quote) => [quote.assetId, quote.price, quote.source])).toEqual([
            ['id-ITUB4', '37.80', 'mock'],
            ['id-HGLG11', '158', 'mock']
        ]);
        expect(Object.keys(MOCK_PRICES)).toHaveLength(16);
    });

    it('derives a stable price for any other asset', () => {
        const first: string = mockPriceOf(asset('XYZW3'));

        expect(mockPriceOf(asset('XYZW3'))).toBe(first);
        expect(mockPriceOf(asset('ABCD3'))).not.toBe(first);
        expect(Number(first)).toBeGreaterThanOrEqual(5);
        expect(Number(first)).toBeLessThan(500);
    });

    it('dates the mock quote at the expected session', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-11T15:00:00Z'));

        const result = await new MockQuoteDriver('coingecko').fetchBatch([asset('bitcoin', 'CRYPTO', 'USD')]);
        const stock = await new MockQuoteDriver('brapi').fetchBatch([asset('ITUB4')]);

        expect(result.quotes[0]?.priceDate).toBe('2026-10-11');
        expect(stock.quotes[0]?.priceDate).toBe('2026-10-09');
        vi.useRealTimers();
    });

    it('serves a fixed PTAX for supported currencies only', async () => {
        const driver: MockExchangeRateDriver = new MockExchangeRateDriver();

        expect(await driver.fetch('USD', new Date('2026-10-09T15:00:00Z'))).toEqual({
            currency: 'USD',
            date: '2026-10-09',
            brlPerUnit: MOCK_USD_RATE,
            source: 'mock'
        });
        expect(await driver.fetch('EUR', new Date())).toBeNull();
    });
});
