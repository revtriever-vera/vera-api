import { describe, expect, it, vi } from 'vitest';
import { AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { AssetQuoteDomain } from '../domain/asset-quote.domain';
import { QuoteFetchFailureDomain } from '../domain/quote-fetch-failure.domain';
import { QuotableAsset } from '../domain/market-data.types';
import { ProviderAsset, ProviderBatchResult, QuoteProviderPort } from '../ports/quote-provider.port';
import { MarketDataLogService } from '../services/market-data-log.service';
import { MarketDataMetricsService } from '../services/market-data-metrics.service';
import { QuoteCollectorService } from '../services/quote-collector.service';
import { QuoteProviderRegistryService } from '../services/quote-provider-registry.service';
import { QuotesChunkApplication } from './quotes-chunk.application';

function asset(id: string, quotesProvider: string = 'us_equities', market: string = 'US'): QuotableAsset {
    return { id, market, externalId: id.toUpperCase(), symbol: id.toUpperCase(), currency: 'USD', quotesProvider };
}

function port(
    provider: string,
    answer: (assets: readonly ProviderAsset[]) => ProviderBatchResult
): QuoteProviderPort & { calls: ReturnType<typeof vi.fn> } {
    const calls: ReturnType<typeof vi.fn> = vi.fn(async (assets: readonly ProviderAsset[]) => Promise.resolve(answer(assets)));
    return { provider, maxBatchSize: 10, fetchBatch: calls, calls } as unknown as QuoteProviderPort & { calls: ReturnType<typeof vi.fn> };
}

function okFor(assets: readonly ProviderAsset[], source: string): ProviderBatchResult {
    return {
        quotes: assets.map((item: ProviderAsset) => ({
            assetId: item.assetId,
            price: '10',
            currency: 'USD',
            priceDate: '2099-01-01',
            source
        })),
        failures: []
    };
}

function failFor(assets: readonly ProviderAsset[], stage: 'request' | 'not_found' | 'budget', reason: string): ProviderBatchResult {
    return { quotes: [], failures: assets.map((item: ProviderAsset) => ({ assetId: item.assetId, stage, reason })) };
}

interface Rig {
    readonly application: QuotesChunkApplication;
    readonly save: ReturnType<typeof vi.fn>;
    readonly record: ReturnType<typeof vi.fn>;
    readonly resolve: ReturnType<typeof vi.fn>;
    readonly fetched: ReturnType<typeof vi.fn>;
    readonly invalid: ReturnType<typeof vi.fn>;
}

function rig(chain: QuoteProviderPort[], assets: QuotableAsset[], stored: { assetId: string; priceDate: string }[] = []): Rig {
    const save: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(1);
    const record: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const resolve: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(0);
    const fetched: ReturnType<typeof vi.fn> = vi.fn();
    const invalid: ReturnType<typeof vi.fn> = vi.fn();
    const collector: QuoteCollectorService = new QuoteCollectorService(
        { chainFor: () => chain } as unknown as QuoteProviderRegistryService,
        { save, findByAssetIds: vi.fn().mockResolvedValue(stored) } as unknown as AssetQuoteDomain,
        { record, resolveForAssets: resolve } as unknown as QuoteFetchFailureDomain,
        { chunkFinished: vi.fn(), providerFailed: vi.fn(), groupWithoutProvider: vi.fn() } as unknown as MarketDataLogService,
        { fetched } as unknown as MarketDataMetricsService
    );
    const catalog: AssetCatalogService = {
        findManyByIds: vi.fn().mockResolvedValue(assets),
        findById: vi
            .fn()
            .mockImplementation(async (id: string) => Promise.resolve(assets.find((item: QuotableAsset) => item.id === id) ?? null))
    } as unknown as AssetCatalogService;
    const application: QuotesChunkApplication = new QuotesChunkApplication(catalog, collector, {
        invalidPayload: invalid
    } as unknown as MarketDataLogService);
    return { application, save, record, resolve, fetched, invalid };
}

const IDS: string[] = ['0199c3a0-0000-7000-8000-00000000000a', '0199c3a0-0000-7000-8000-00000000000b'];

describe('QuotesChunkApplication.handleChunk', () => {
    it('stores what the provider answered and resolves old failures of those assets', async () => {
        const finnhub = port('finnhub', (assets) => okFor(assets, 'finnhub'));
        const { application, save, resolve, fetched, record } = rig([finnhub], [asset(IDS[0] ?? ''), asset(IDS[1] ?? '')]);

        await application.handleChunk({ provider: 'us_equities', assetIds: IDS });

        expect(save).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ assetId: IDS[0], source: 'finnhub' })]),
            expect.any(Date)
        );
        expect(resolve).toHaveBeenCalledWith(IDS);
        expect(fetched).toHaveBeenCalledWith('finnhub', 'ok', 2);
        expect(record).toHaveBeenCalledWith([]);
    });

    it('records an unknown symbol as not_found without dropping the rest of the chunk', async () => {
        const finnhub = port('finnhub', (assets) => ({
            quotes: okFor(assets.slice(0, 1), 'finnhub').quotes,
            failures: failFor(assets.slice(1), 'not_found', 'market-data.symbol_unknown').failures
        }));
        const { application, save, record } = rig([finnhub], [asset(IDS[0] ?? ''), asset(IDS[1] ?? '')]);

        await application.handleChunk({ provider: 'us_equities', assetIds: IDS });

        expect(save).toHaveBeenCalledWith([expect.objectContaining({ assetId: IDS[0] })], expect.any(Date));
        expect(record).toHaveBeenCalledWith([
            { assetId: IDS[1], provider: 'finnhub', stage: 'not_found', reason: 'market-data.symbol_unknown' }
        ]);
    });

    it('falls back to the next US provider for the assets the first one failed', async () => {
        const finnhub = port('finnhub', (assets) => failFor(assets, 'request', 'market-data.provider_unavailable'));
        const twelvedata = port('twelvedata', (assets) => okFor(assets, 'twelvedata'));
        const { application, save, record } = rig([finnhub, twelvedata], [asset(IDS[0] ?? '')]);

        await application.handleChunk({ provider: 'us_equities', assetIds: [IDS[0] ?? ''] });

        expect(twelvedata.calls).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledWith([expect.objectContaining({ source: 'twelvedata' })], expect.any(Date));
        expect(record).toHaveBeenCalledWith([]);
    });

    it('records the budget failure of the last provider and finishes without throwing', async () => {
        const finnhub = port('finnhub', (assets) => failFor(assets, 'budget', 'market-data.budget_exhausted'));
        const { application, save, record } = rig([finnhub], [asset(IDS[0] ?? ''), asset(IDS[1] ?? '')]);

        await expect(application.handleChunk({ provider: 'us_equities', assetIds: IDS })).resolves.toBeUndefined();

        expect(save).not.toHaveBeenCalled();
        expect(record).toHaveBeenCalledWith([
            { assetId: IDS[0], provider: 'finnhub', stage: 'budget', reason: 'market-data.budget_exhausted' },
            { assetId: IDS[1], provider: 'finnhub', stage: 'budget', reason: 'market-data.budget_exhausted' }
        ]);
    });

    it('skips assets whose quote already has the expected session date', async () => {
        const finnhub = port('finnhub', (assets) => okFor(assets, 'finnhub'));
        const { application, save } = rig([finnhub], [asset(IDS[0] ?? '')], [{ assetId: IDS[0] ?? '', priceDate: '2099-01-01' }]);

        await application.handleChunk({ provider: 'us_equities', assetIds: [IDS[0] ?? ''] });

        expect(finnhub.calls).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
    });

    it('refetches an asset whose stored quote is older than the expected session', async () => {
        const finnhub = port('finnhub', (assets) => okFor(assets, 'finnhub'));
        const { application, save } = rig([finnhub], [asset(IDS[0] ?? '')], [{ assetId: IDS[0] ?? '', priceDate: '2020-01-01' }]);

        await application.handleChunk({ provider: 'us_equities', assetIds: [IDS[0] ?? ''] });

        expect(save).toHaveBeenCalledTimes(1);
    });

    it('does nothing for a group without registered providers', async () => {
        const { application, save } = rig([], [asset(IDS[0] ?? '')]);

        await application.handleChunk({ provider: 'us_equities', assetIds: [IDS[0] ?? ''] });

        expect(save).not.toHaveBeenCalled();
    });

    it('drops an invalid payload with a log', async () => {
        const { application, invalid } = rig([], []);

        await application.handleChunk({ provider: 'nope' });

        expect(invalid).toHaveBeenCalledWith('market-data.quotes.chunk.requested');
    });
});

describe('QuotesChunkApplication.handleOnDemand', () => {
    it('quotes the single asset through the chain of its own group', async () => {
        const coingecko = port('coingecko', (assets) => okFor(assets, 'coingecko'));
        const { application, save } = rig([coingecko], [asset(IDS[0] ?? '', 'coingecko', 'CRYPTO')]);

        await application.handleOnDemand({ assetId: IDS[0] });

        expect(save).toHaveBeenCalledWith([expect.objectContaining({ assetId: IDS[0], source: 'coingecko' })], expect.any(Date));
    });

    it('drops invalid payloads and unknown assets with a log', async () => {
        const { application, invalid } = rig([], []);

        await application.handleOnDemand({ assetId: 'x' });
        await application.handleOnDemand({ assetId: IDS[0] });

        expect(invalid).toHaveBeenCalledTimes(2);
    });
});
