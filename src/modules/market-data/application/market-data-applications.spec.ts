import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { ExchangeRateDomain } from '../domain/exchange-rate.domain';
import { ExchangeRateUnavailableError } from '../domain/market-data.errors';
import { QuotableAsset } from '../domain/market-data.types';
import { ExchangeRateReaderService } from '../services/exchange-rate-reader.service';
import { HeldAssetsService } from '../services/held-assets.service';
import { MarketDataLogService } from '../services/market-data-log.service';
import { MarketDataMetricsService } from '../services/market-data-metrics.service';
import { QuoteCollectorService } from '../services/quote-collector.service';
import { QuoteReaderService } from '../services/quote-reader.service';
import { QuoteReadApplication } from './quote-read.application';
import { ReferenceDataApplication } from './reference-data.application';

function bond(id: string): QuotableAsset {
    return { id, market: 'TESOURO', externalId: id, symbol: id, currency: 'BRL', quotesProvider: 'tesouro' };
}

function stock(id: string): QuotableAsset {
    return { id, market: 'B3', externalId: id, symbol: id, currency: 'BRL', quotesProvider: 'brapi' };
}

function rig(options: { assets?: QuotableAsset[]; rate?: unknown; rateError?: Error } = {}): {
    application: ReferenceDataApplication;
    collect: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    rateAge: ReturnType<typeof vi.fn>;
    missing: ReturnType<typeof vi.fn>;
    failed: ReturnType<typeof vi.fn>;
} {
    const collect: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ requested: 1, stored: 1, failed: 0 });
    const save: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const rateAge: ReturnType<typeof vi.fn> = vi.fn();
    const missing: ReturnType<typeof vi.fn> = vi.fn();
    const failed: ReturnType<typeof vi.fn> = vi.fn();
    const fetch: ReturnType<typeof vi.fn> = options.rateError
        ? vi.fn().mockRejectedValue(options.rateError)
        : vi.fn().mockResolvedValue(options.rate ?? null);
    const application: ReferenceDataApplication = new ReferenceDataApplication(
        { listHeldAssetIds: vi.fn().mockResolvedValue(['x']) } as unknown as HeldAssetsService,
        { findManyByIds: vi.fn().mockResolvedValue(options.assets ?? []) } as unknown as AssetCatalogService,
        { collect } as unknown as QuoteCollectorService,
        { fetch },
        { save } as unknown as ExchangeRateDomain,
        { rateAge } as unknown as MarketDataMetricsService,
        { rateStored: vi.fn(), rateMissing: missing, rateFailed: failed } as unknown as MarketDataLogService
    );
    return { application, collect, save, rateAge, missing, failed };
}

describe('ReferenceDataApplication', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('quotes only the held Tesouro bonds and stores the PTAX with its age', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-12T15:00:00Z'));
        const rate = { currency: 'USD', date: '2026-10-09', brlPerUnit: '5.4231', source: 'bcb-ptax' };
        const { application, collect, save, rateAge } = rig({ assets: [bond('t1'), stock('s1')], rate });

        await application.handleReference();

        expect(collect).toHaveBeenCalledWith('tesouro', [bond('t1')]);
        expect(save).toHaveBeenCalledWith(rate, expect.any(Date));
        expect(rateAge).toHaveBeenCalledWith('USD', 3);
    });

    it('skips the Tesouro fetch when no bond is held', async () => {
        const { application, collect } = rig({ assets: [stock('s1')] });

        await application.handleReference();

        expect(collect).not.toHaveBeenCalled();
    });

    it('only refreshes the rate in the afternoon tick', async () => {
        const { application, collect, save } = rig({ rate: { currency: 'USD', date: '2026-10-09', brlPerUnit: '5.4', source: 'mock' } });

        await application.handlePtax();

        expect(collect).not.toHaveBeenCalled();
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('logs a missing rate without failing', async () => {
        const { application, save, missing } = rig();

        await application.handlePtax();

        expect(save).not.toHaveBeenCalled();
        expect(missing).toHaveBeenCalledWith('USD');
    });

    it('logs and rethrows a provider error so the job retries', async () => {
        const { application, failed } = rig({ rateError: new Error('unreachable') });

        await expect(application.handlePtax()).rejects.toThrow('unreachable');
        expect(failed).toHaveBeenCalledWith('USD', expect.any(Error));
    });
});

describe('QuoteReadApplication', () => {
    it('shapes the quotes response from the reader', async () => {
        const quote = { assetId: 'a', price: '10', currency: 'BRL', priceDate: '2026-10-09', source: 'brapi', stale: false };
        const application: QuoteReadApplication = new QuoteReadApplication(
            {
                getLatestWithPending: vi.fn().mockResolvedValue({ quotes: new Map([['a', quote]]), pendingAssetIds: ['b'] })
            } as unknown as QuoteReaderService,
            {} as unknown as ExchangeRateReaderService
        );

        expect(await application.quotesOf(['a', 'b'])).toEqual({ quotes: [quote], pendingAssetIds: ['b'] });
    });

    it('returns the latest rate or fails with the exchange_rate_unavailable error', async () => {
        const latest: ReturnType<typeof vi.fn> = vi
            .fn()
            .mockResolvedValueOnce({ currency: 'USD', brlPerUnit: '5.42', date: '2026-10-09', source: 'bcb-ptax' })
            .mockResolvedValueOnce(null);
        const application: QuoteReadApplication = new QuoteReadApplication(
            {} as unknown as QuoteReaderService,
            { latest } as unknown as ExchangeRateReaderService
        );

        expect((await application.exchangeRateOf('USD')).brlPerUnit).toBe('5.42');
        const error: unknown = await application.exchangeRateOf('USD').catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(ExchangeRateUnavailableError);
        expect(error).toMatchObject({ code: 'market-data.exchange_rate_unavailable', status: 404 });
    });
});
