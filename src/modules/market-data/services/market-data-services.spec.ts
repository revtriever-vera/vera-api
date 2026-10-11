import { DiscoveryService } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { parseMarketDataConfig } from '../config/market-data.config';
import { ExchangeRateDomain } from '../domain/exchange-rate.domain';
import { EmptyHeldAssetsDriver } from '../drivers/empty-held-assets.driver';
import { MockQuoteDriver } from '../drivers/mock-quote.driver';
import { HeldAssetsPort } from '../ports/held-assets.port';
import { QuoteProviderPort } from '../ports/quote-provider.port';
import { ExchangeRateReaderService } from './exchange-rate-reader.service';
import { HeldAssetsService } from './held-assets.service';
import { QuoteProviderRegistryService, selectQuoteProviders } from './quote-provider-registry.service';

class FixedHeldAssets extends HeldAssetsPort {
    public constructor(private readonly ids: readonly string[]) {
        super();
    }

    public listHeldAssetIdsAcrossTenants(): Promise<readonly string[]> {
        return Promise.resolve(this.ids);
    }
}

describe('HeldAssetsService', () => {
    it('unions every registered port, de-duplicated and sorted', async () => {
        const discovery: DiscoveryService = {
            getProviders: () => [
                { instance: new FixedHeldAssets(['b', 'a']) },
                { instance: new FixedHeldAssets(['c', 'a']) },
                { instance: new EmptyHeldAssetsDriver() },
                { instance: {} },
                { instance: undefined }
            ]
        } as unknown as DiscoveryService;

        expect(await new HeldAssetsService(discovery).listHeldAssetIds()).toEqual(['a', 'b', 'c']);
    });

    it('returns nothing when only the empty default is registered', async () => {
        const discovery: DiscoveryService = {
            getProviders: () => [{ instance: new EmptyHeldAssetsDriver() }]
        } as unknown as DiscoveryService;

        expect(await new HeldAssetsService(discovery).listHeldAssetIds()).toEqual([]);
    });
});

describe('ExchangeRateReaderService', () => {
    it('answers 1 for BRL without reading the table', async () => {
        const latestOnOrBefore: ReturnType<typeof vi.fn> = vi.fn();
        const service: ExchangeRateReaderService = new ExchangeRateReaderService({ latestOnOrBefore } as unknown as ExchangeRateDomain);

        expect(await service.latest('BRL', new Date('2026-10-09T15:00:00Z'))).toEqual({
            currency: 'BRL',
            brlPerUnit: '1',
            date: '2026-10-09',
            source: 'builtin'
        });
        expect(latestOnOrBefore).not.toHaveBeenCalled();
    });

    it('reads the latest rate on or before the Brazilian date', async () => {
        const latestOnOrBefore: ReturnType<typeof vi.fn> = vi
            .fn()
            .mockResolvedValue({ currency: 'USD', brlPerUnit: '5.4200000000', date: '2026-10-09', source: 'bcb-ptax' });
        const service: ExchangeRateReaderService = new ExchangeRateReaderService({ latestOnOrBefore } as unknown as ExchangeRateDomain);

        const rate = await service.latest('USD', new Date('2026-10-11T01:00:00Z'));

        expect(latestOnOrBefore).toHaveBeenCalledWith('USD', '2026-10-10');
        expect(rate?.brlPerUnit).toBe('5.42');
    });
});

describe('selectQuoteProviders and the registry', () => {
    const live = (id: string): QuoteProviderPort =>
        ({ provider: id, maxBatchSize: 7, fetchBatch: vi.fn() }) as unknown as QuoteProviderPort;
    const everyone = {
        brapi: live('brapi'),
        finnhub: live('finnhub'),
        twelvedata: live('twelvedata'),
        alphavantage: live('alphavantage'),
        coingecko: live('coingecko'),
        tesouro: live('tesouro')
    } as unknown as Parameters<typeof selectQuoteProviders>[1];

    it('uses mock drivers for every group in mock mode', () => {
        const providers: QuoteProviderPort[] = selectQuoteProviders(parseMarketDataConfig({}), everyone);

        expect(providers.every((provider: QuoteProviderPort) => provider instanceof MockQuoteDriver)).toBe(true);
        expect(providers.map((provider: QuoteProviderPort) => provider.provider).sort()).toEqual([
            'brapi',
            'coingecko',
            'finnhub',
            'tesouro'
        ]);
    });

    it('registers only the providers that have a key in live mode, keeping the Tesouro', () => {
        const providers: QuoteProviderPort[] = selectQuoteProviders(
            parseMarketDataConfig({ MARKET_DATA_DRIVER: 'live', BRAPI_TOKEN: 'k', TWELVEDATA_API_KEY: 'k' }),
            everyone
        );

        expect(providers.map((provider: QuoteProviderPort) => provider.provider)).toEqual(['brapi', 'twelvedata', 'tesouro']);
    });

    it('orders the US chain by US_QUOTE_PROVIDERS and sizes chunks by the head provider', () => {
        const config = parseMarketDataConfig({
            MARKET_DATA_DRIVER: 'live',
            FINNHUB_API_KEY: 'k',
            TWELVEDATA_API_KEY: 'k',
            ALPHAVANTAGE_API_KEY: 'k',
            US_QUOTE_PROVIDERS: 'twelvedata,finnhub'
        });
        const registry: QuoteProviderRegistryService = new QuoteProviderRegistryService(selectQuoteProviders(config, everyone), config);

        expect(registry.chainFor('us_equities').map((provider: QuoteProviderPort) => provider.provider)).toEqual(['twelvedata', 'finnhub']);
        expect(registry.chunkSizeOf('us_equities')).toBe(7);
        expect(registry.chunkSizeOf('brapi')).toBe(0);
        expect(registry.chunkSpacingMs('brapi')).toBe(0);
    });

    it('spaces chunks so the per minute limit is respected, with a floor', () => {
        const config = parseMarketDataConfig({
            MARKET_DATA_DRIVER: 'live',
            FINNHUB_API_KEY: 'k',
            BRAPI_TOKEN: 'k',
            FINNHUB_LIMIT_MINUTE: '14'
        });
        const registry: QuoteProviderRegistryService = new QuoteProviderRegistryService(selectQuoteProviders(config, everyone), config);

        expect(registry.chunkSpacingMs('us_equities')).toBe(30_000);
        expect(registry.chunkSpacingMs('brapi')).toBe(1000);
    });

    it('does not space chunks in mock mode', () => {
        const config = parseMarketDataConfig({});
        const registry: QuoteProviderRegistryService = new QuoteProviderRegistryService(selectQuoteProviders(config, everyone), config);

        expect(registry.chunkSpacingMs('us_equities')).toBe(0);
        expect(registry.chunkSizeOf('us_equities')).toBe(500);
    });
});
