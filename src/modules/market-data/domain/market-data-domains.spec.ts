import { describe, expect, it, vi } from 'vitest';
import { AssetQuotesRepository } from '../repositories/asset-quotes.repository';
import { ExchangeRatesRepository } from '../repositories/exchange-rates.repository';
import { QuoteFetchFailuresRepository } from '../repositories/quote-fetch-failures.repository';
import { AssetQuoteDomain } from './asset-quote.domain';
import { ExchangeRateDomain } from './exchange-rate.domain';
import { QuoteFetchFailureDomain } from './quote-fetch-failure.domain';

describe('AssetQuoteDomain.save', () => {
    it('keeps the newest quote per asset before the upsert', async () => {
        const upsertQuotes: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(2);
        const domain: AssetQuoteDomain = new AssetQuoteDomain({ upsertQuotes } as unknown as AssetQuotesRepository);
        const at: Date = new Date('2026-10-09T00:00:00Z');

        await domain.save(
            [
                { assetId: 'a', price: '1', currency: 'BRL', priceDate: '2026-10-08', source: 'brapi' },
                { assetId: 'a', price: '2', currency: 'BRL', priceDate: '2026-10-09', source: 'brapi' },
                { assetId: 'b', price: '3', currency: 'BRL', priceDate: '2026-10-09', source: 'brapi' }
            ],
            at
        );

        expect(upsertQuotes).toHaveBeenCalledWith(
            [
                { assetId: 'a', price: '2', currency: 'BRL', priceDate: '2026-10-09', source: 'brapi' },
                { assetId: 'b', price: '3', currency: 'BRL', priceDate: '2026-10-09', source: 'brapi' }
            ],
            at
        );
    });

    it('reads by ids', async () => {
        const findByAssetIds: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue([]);

        await new AssetQuoteDomain({ findByAssetIds } as unknown as AssetQuotesRepository).findByAssetIds(['a']);

        expect(findByAssetIds).toHaveBeenCalledWith(['a']);
    });
});

describe('QuoteFetchFailureDomain', () => {
    it('skips the write when there is nothing to record', async () => {
        const record: ReturnType<typeof vi.fn> = vi.fn();
        const domain: QuoteFetchFailureDomain = new QuoteFetchFailureDomain({ record } as unknown as QuoteFetchFailuresRepository);

        await domain.record([]);
        await domain.record([{ assetId: 'a', provider: 'brapi', stage: 'request', reason: 'r' }]);

        expect(record).toHaveBeenCalledTimes(1);
    });

    it('resolves and counts open failures', async () => {
        const resolveForAssets: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(1);
        const countOpen: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(7);
        const domain: QuoteFetchFailureDomain = new QuoteFetchFailureDomain({
            resolveForAssets,
            countOpen
        } as unknown as QuoteFetchFailuresRepository);

        expect(await domain.resolveForAssets(['a'])).toBe(1);
        expect(await domain.countOpen()).toBe(7);
        expect(resolveForAssets).toHaveBeenCalledWith(['a'], expect.any(Date));
    });
});

describe('ExchangeRateDomain', () => {
    it('delegates the save and the lookup', async () => {
        const upsertRate: ReturnType<typeof vi.fn> = vi.fn();
        const findLatestOnOrBefore: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(null);
        const domain: ExchangeRateDomain = new ExchangeRateDomain({
            upsertRate,
            findLatestOnOrBefore
        } as unknown as ExchangeRatesRepository);
        const at: Date = new Date();

        await domain.save({ currency: 'USD', date: '2026-10-09', brlPerUnit: '5.4', source: 'mock' }, at);

        expect(upsertRate).toHaveBeenCalledWith({ currency: 'USD', date: '2026-10-09', brlPerUnit: '5.4', source: 'mock' }, at);
        expect(await domain.latestOnOrBefore('USD', '2026-10-09')).toBeNull();
    });
});
