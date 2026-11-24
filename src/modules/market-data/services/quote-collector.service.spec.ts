import { describe, expect, it, vi } from 'vitest';
import { AssetQuoteDomain } from '../domain/asset-quote.domain';
import { QuoteFetchFailureDomain } from '../domain/quote-fetch-failure.domain';
import { QuotableAsset } from '../domain/market-data.types';
import { ProviderQuote, QuoteProviderPort } from '../ports/quote-provider.port';
import { MarketDataLogService } from './market-data-log.service';
import { MarketDataMetricsService } from './market-data-metrics.service';
import { QuoteCollectorService } from './quote-collector.service';
import { QuoteProviderRegistryService } from './quote-provider-registry.service';

const FUND: QuotableAsset = { id: 'f1', market: 'CVM', externalId: '11111111000191', symbol: 'F1', currency: 'BRL', quotesProvider: 'cvm' };

function quote(price: string, priceDate: string): ProviderQuote {
    return { assetId: 'f1', price, currency: 'BRL', priceDate, source: 'cvm' };
}

function rig(
    answer: ProviderQuote,
    stored: { assetId: string; price: string; priceDate: string }[]
): {
    collector: QuoteCollectorService;
    save: ReturnType<typeof vi.fn>;
    resolve: ReturnType<typeof vi.fn>;
    fetch: ReturnType<typeof vi.fn>;
} {
    const fetch: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ quotes: [answer], failures: [] });
    const save: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(1);
    const resolve: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(1);
    const port: QuoteProviderPort = { provider: 'cvm', maxBatchSize: 10, fetchBatch: fetch } as unknown as QuoteProviderPort;
    const collector: QuoteCollectorService = new QuoteCollectorService(
        { chainFor: () => [port] } as unknown as QuoteProviderRegistryService,
        { save, findByAssetIds: vi.fn().mockResolvedValue(stored) } as unknown as AssetQuoteDomain,
        { record: vi.fn().mockResolvedValue(undefined), resolveForAssets: resolve } as unknown as QuoteFetchFailureDomain,
        { chunkFinished: vi.fn(), providerFailed: vi.fn() } as unknown as MarketDataLogService,
        { fetched: vi.fn() } as unknown as MarketDataMetricsService
    );
    return { collector, save, resolve, fetch };
}

describe('QuoteCollectorService for the fund group', () => {
    it('asks the provider even when the stored quote already has the expected date', async () => {
        const { collector, fetch } = rig(quote('10', '2026-10-13'), [{ assetId: 'f1', price: '10', priceDate: '2026-10-13' }]);

        await collector.collect('cvm', [FUND], new Date('2026-10-14T12:00:00Z'));

        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('rewrites the price when the same date comes back with another value', async () => {
        const { collector, save } = rig(quote('10.5', '2026-10-13'), [{ assetId: 'f1', price: '10.000000', priceDate: '2026-10-13' }]);

        await collector.collect('cvm', [FUND]);

        expect(save).toHaveBeenCalledWith([quote('10.5', '2026-10-13')], expect.any(Date));
    });

    it('writes nothing when the quote is the one already stored, but still resolves its failure', async () => {
        const { collector, save, resolve } = rig(quote('10.50', '2026-10-13'), [
            { assetId: 'f1', price: '10.5000', priceDate: '2026-10-13' }
        ]);

        await collector.collect('cvm', [FUND]);

        expect(save).not.toHaveBeenCalled();
        expect(resolve).toHaveBeenCalledWith(['f1']);
    });

    it('writes the quote of a fund that has none yet', async () => {
        const { collector, save } = rig(quote('10', '2026-10-13'), []);

        await collector.collect('cvm', [FUND]);

        expect(save).toHaveBeenCalledTimes(1);
    });
});
