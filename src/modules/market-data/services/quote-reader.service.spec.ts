import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { AssetQuoteDomain } from '../domain/asset-quote.domain';
import { QuotableAsset } from '../domain/market-data.types';
import { QuoteReaderService } from './quote-reader.service';

function asset(id: string, market: string = 'B3'): QuotableAsset {
    return { id, market, externalId: id, symbol: id, currency: 'BRL', quotesProvider: 'brapi' };
}

function rig(
    assets: QuotableAsset[],
    records: { assetId: string; priceDate: string }[]
): { service: QuoteReaderService; publish: ReturnType<typeof vi.fn> } {
    const publish: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const service: QuoteReaderService = new QuoteReaderService(
        {
            findByAssetIds: vi
                .fn()
                .mockResolvedValue(records.map((record) => ({ price: '10', currency: 'BRL', source: 'brapi', ...record })))
        } as unknown as AssetQuoteDomain,
        { findManyByIds: vi.fn().mockResolvedValue(assets) } as unknown as AssetCatalogService,
        { publish }
    );
    return { service, publish };
}

describe('QuoteReaderService', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('lists an asset without a quote as pending and requests one on-demand fetch for the day', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-09T15:00:00Z'));
        const { service, publish } = rig([asset('a')], []);

        const latest = await service.getLatestWithPending(['a', 'a']);

        expect(latest.pendingAssetIds).toEqual(['a']);
        expect(latest.quotes.size).toBe(0);
        expect(publish).toHaveBeenCalledTimes(1);
        expect(publish).toHaveBeenCalledWith(
            'vera-market-data',
            'market-data.quote.ondemand.requested',
            { assetId: 'a' },
            { jobId: 'quote-ondemand-a-2026-10-09', retryFailed: true }
        );
    });

    it('returns an old quote flagged stale and still asks for a refresh', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-12T15:00:00Z'));
        const { service, publish } = rig(
            [asset('a'), asset('b')],
            [
                { assetId: 'a', priceDate: '2026-10-05' },
                { assetId: 'b', priceDate: '2026-10-09' }
            ]
        );

        const quotes = await service.getLatest(['a', 'b']);

        expect(quotes.get('a')).toMatchObject({ stale: true, price: '10', priceDate: '2026-10-05' });
        expect(quotes.get('b')).toMatchObject({ stale: false });
        expect(publish).toHaveBeenCalledTimes(1);
        expect(publish.mock.calls[0]?.[2]).toEqual({ assetId: 'a' });
    });

    it('applies the shorter window to crypto', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-12T15:00:00Z'));
        const { service } = rig([asset('btc', 'CRYPTO')], [{ assetId: 'btc', priceDate: '2026-10-09' }]);

        expect((await service.getLatest(['btc'])).get('btc')?.stale).toBe(true);
    });

    it('ignores ids the catalog does not know', async () => {
        const { service, publish } = rig([], []);

        const latest = await service.getLatestWithPending(['ghost']);

        expect(latest.pendingAssetIds).toEqual([]);
        expect(publish).not.toHaveBeenCalled();
    });
});
