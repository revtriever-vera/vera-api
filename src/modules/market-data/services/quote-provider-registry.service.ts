import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { marketDataConfig, MarketDataSettings } from '../config/market-data.config';
import { GROUP_BY_PROVIDER, QUOTE_GROUPS, QUOTE_PROVIDER_IDS, QuoteGroup, QuoteProviderId } from '../domain/market-data.types';
import { MockQuoteDriver } from '../drivers/mock-quote.driver';
import { QUOTE_PROVIDERS, QuoteProviderPort } from '../ports/quote-provider.port';

const MINUTE_MS: number = 60_000;
const MIN_CHUNK_SPACING_MS: number = 1000;

const LIVE_REQUIREMENTS: Readonly<Record<QuoteProviderId, (config: MarketDataSettings) => boolean>> = {
    brapi: (config: MarketDataSettings): boolean => config.BRAPI_TOKEN !== undefined,
    finnhub: (config: MarketDataSettings): boolean => config.FINNHUB_API_KEY !== undefined,
    twelvedata: (config: MarketDataSettings): boolean => config.TWELVEDATA_API_KEY !== undefined,
    alphavantage: (config: MarketDataSettings): boolean => config.ALPHAVANTAGE_API_KEY !== undefined,
    coingecko: (config: MarketDataSettings): boolean => config.COINGECKO_API_KEY !== undefined,
    tesouro: (): boolean => true
};

const MOCK_PROVIDER_IDS: readonly QuoteProviderId[] = [
    QUOTE_PROVIDER_IDS.brapi,
    QUOTE_PROVIDER_IDS.finnhub,
    QUOTE_PROVIDER_IDS.coingecko,
    QUOTE_PROVIDER_IDS.tesouro
];

export function selectQuoteProviders(
    config: MarketDataSettings,
    live: Readonly<Record<QuoteProviderId, QuoteProviderPort>>
): QuoteProviderPort[] {
    if (config.DRIVER === 'mock') {
        return MOCK_PROVIDER_IDS.map((provider: QuoteProviderId): QuoteProviderPort => new MockQuoteDriver(provider));
    }
    return Object.values(QUOTE_PROVIDER_IDS)
        .filter((provider: QuoteProviderId): boolean => LIVE_REQUIREMENTS[provider](config))
        .map((provider: QuoteProviderId): QuoteProviderPort => live[provider]);
}

@Injectable()
export class QuoteProviderRegistryService {
    public constructor(
        @Inject(QUOTE_PROVIDERS) private readonly providers: readonly QuoteProviderPort[],
        @Inject(marketDataConfig.KEY) private readonly config: ConfigType<typeof marketDataConfig>
    ) {}

    public chainFor(group: QuoteGroup): QuoteProviderPort[] {
        const inGroup: QuoteProviderPort[] = this.providers.filter(
            (port: QuoteProviderPort): boolean => GROUP_BY_PROVIDER[port.provider] === group
        );
        if (group !== QUOTE_GROUPS.usEquities) {
            return inGroup;
        }
        const byId: Map<string, QuoteProviderPort> = new Map<string, QuoteProviderPort>(
            inGroup.map((port: QuoteProviderPort): [string, QuoteProviderPort] => [port.provider, port])
        );
        return this.config.US_QUOTE_PROVIDERS.flatMap((id: string): QuoteProviderPort[] => {
            const port: QuoteProviderPort | undefined = byId.get(id);
            return port === undefined ? [] : [port];
        });
    }

    public chunkSizeOf(group: QuoteGroup): number {
        return this.chainFor(group)[0]?.maxBatchSize ?? 0;
    }

    public chunkSpacingMs(group: QuoteGroup): number {
        const head: QuoteProviderPort | undefined = this.chainFor(group)[0];
        if (head === undefined || this.config.DRIVER === 'mock') {
            return 0;
        }
        const perMinute: number | undefined = this.config.LIMITS[head.provider].minute;
        if (perMinute === undefined) {
            return MIN_CHUNK_SPACING_MS;
        }
        return Math.max(MIN_CHUNK_SPACING_MS, Math.ceil((MINUTE_MS * head.maxBatchSize) / perMinute));
    }
}
