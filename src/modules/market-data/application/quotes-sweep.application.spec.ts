import { describe, expect, it, vi } from 'vitest';
import { AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { AssetQuoteDomain } from '../domain/asset-quote.domain';
import { QuotableAsset } from '../domain/market-data.types';
import { HeldAssetsService } from '../services/held-assets.service';
import { MarketDataLogService } from '../services/market-data-log.service';
import { MarketDataMetricsService } from '../services/market-data-metrics.service';
import { ProviderBudgetService } from '../services/provider-budget.service';
import { QuoteProviderRegistryService } from '../services/quote-provider-registry.service';
import { QuotesSweepApplication } from './quotes-sweep.application';

function asset(id: string, quotesProvider: string, market: string = 'B3'): QuotableAsset {
    return { id, market, externalId: id, symbol: id, currency: 'BRL', quotesProvider };
}

interface Rig {
    readonly application: QuotesSweepApplication;
    readonly publish: ReturnType<typeof vi.fn>;
    readonly staleAssets: ReturnType<typeof vi.fn>;
    readonly prune: ReturnType<typeof vi.fn>;
}

function rig(
    held: string[],
    assets: QuotableAsset[],
    sizes: Record<string, number> = {},
    stored: { assetId: string; priceDate: string }[] = []
): Rig {
    const publish: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const staleAssets: ReturnType<typeof vi.fn> = vi.fn();
    const prune: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const application: QuotesSweepApplication = new QuotesSweepApplication(
        { listHeldAssetIds: vi.fn().mockResolvedValue(held) } as unknown as HeldAssetsService,
        { findManyByIds: vi.fn().mockResolvedValue(assets) } as unknown as AssetCatalogService,
        {
            chunkSizeOf: (group: string) => sizes[group] ?? 2,
            chunkSpacingMs: () => 1000
        } as unknown as QuoteProviderRegistryService,
        { publish },
        { pruneOldUsage: prune } as unknown as ProviderBudgetService,
        { findByAssetIds: vi.fn().mockResolvedValue(stored) } as unknown as AssetQuoteDomain,
        { staleAssets } as unknown as MarketDataMetricsService,
        { sweepFinished: vi.fn() } as unknown as MarketDataLogService
    );
    return { application, publish, staleAssets, prune };
}

describe('QuotesSweepApplication.handleTick', () => {
    it('groups by provider, cuts chunks of the provider size and staggers the delays', async () => {
        const assets: QuotableAsset[] = [
            asset('b5', 'brapi'),
            asset('b1', 'brapi'),
            asset('b3', 'brapi'),
            asset('b2', 'brapi'),
            asset('b4', 'brapi'),
            asset('u1', 'us_equities', 'US'),
            asset('c1', 'coingecko', 'CRYPTO'),
            asset('t1', 'tesouro', 'TESOURO')
        ];
        const { application, publish } = rig(
            assets.map((item: QuotableAsset) => item.id),
            assets
        );

        const chunks: number = await application.handleTick();

        expect(chunks).toBe(5);
        const calls: unknown[][] = publish.mock.calls;
        const brapi = calls.filter((call: unknown[]) => (call[2] as { provider: string }).provider === 'brapi');
        expect(brapi.map((call: unknown[]) => (call[2] as { assetIds: string[] }).assetIds)).toEqual([['b1', 'b2'], ['b3', 'b4'], ['b5']]);
        expect(brapi.map((call: unknown[]) => (call[3] as { delayMs: number }).delayMs)).toEqual([0, 1000, 2000]);
        expect(calls.some((call: unknown[]) => JSON.stringify(call[2]).includes('t1'))).toBe(false);
        expect(calls[0]?.[0]).toBe('vera-market-data');
        expect(calls[0]?.[1]).toBe('market-data.quotes.chunk.requested');
    });

    it('builds the same jobId for the same set and another one for a different set', async () => {
        const first = rig(['a', 'b'], [asset('a', 'brapi'), asset('b', 'brapi')]);
        const again = rig(['a', 'b'], [asset('b', 'brapi'), asset('a', 'brapi')]);
        const other = rig(['a', 'c'], [asset('a', 'brapi'), asset('c', 'brapi')]);

        await first.application.handleTick();
        await again.application.handleTick();
        await other.application.handleTick();

        const jobId = (rigged: Rig): string => (rigged.publish.mock.calls[0]?.[3] as { jobId: string }).jobId;
        expect(jobId(first)).toBe(jobId(again));
        expect(jobId(first)).not.toBe(jobId(other));
        expect(jobId(first)).toMatch(/^quotes-chunk-\d{4}-\d{2}-\d{2}-brapi-[0-9a-f]{20}$/);
    });

    it('publishes nothing when no asset is held, but still prunes and zeroes the gauge', async () => {
        const { application, publish, prune, staleAssets } = rig([], []);

        expect(await application.handleTick()).toBe(0);

        expect(publish).not.toHaveBeenCalled();
        expect(prune).toHaveBeenCalledTimes(1);
        expect(staleAssets).toHaveBeenCalledWith(0);
    });

    it('skips a group without providers', async () => {
        const { application, publish } = rig(['a'], [asset('a', 'brapi')], { brapi: 0 });

        expect(await application.handleTick()).toBe(0);
        expect(publish).not.toHaveBeenCalled();
    });

    it('counts assets without a quote or with an old one as stale', async () => {
        const { application, staleAssets } = rig(['a', 'b', 'c'], [asset('a', 'brapi'), asset('b', 'brapi'), asset('c', 'brapi')], {}, [
            { assetId: 'a', priceDate: '2099-01-01' },
            { assetId: 'b', priceDate: '2020-01-01' }
        ]);

        await application.handleTick();

        expect(staleAssets).toHaveBeenCalledWith(2);
    });
});
