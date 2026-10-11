import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { QueueModule } from '../../../core/queue/queue.module';
import { CatalogApplicationModule } from '../../catalog/application/catalog-application.module';
import { marketDataConfig } from '../config/market-data.config';
import { MarketDataDomainModule } from '../domain/market-data-domain.module';
import { QUOTE_PROVIDER_IDS, QuoteProviderId } from '../domain/market-data.types';
import { AlphaVantageQuoteDriver } from '../drivers/alphavantage-quote.driver';
import { BcbPtaxDriver } from '../drivers/bcb-ptax.driver';
import { BrapiQuoteDriver } from '../drivers/brapi-quote.driver';
import { CoinGeckoQuoteDriver } from '../drivers/coingecko-quote.driver';
import { EmptyHeldAssetsDriver } from '../drivers/empty-held-assets.driver';
import { FinnhubQuoteDriver } from '../drivers/finnhub-quote.driver';
import { MockExchangeRateDriver } from '../drivers/mock-exchange-rate.driver';
import { TesouroQuoteDriver } from '../drivers/tesouro-quote.driver';
import { TwelveDataQuoteDriver } from '../drivers/twelvedata-quote.driver';
import { ExchangeRatePort } from '../ports/exchange-rate.port';
import { QUOTE_PROVIDERS, QuoteProviderPort } from '../ports/quote-provider.port';
import { ExchangeRateReaderService } from '../services/exchange-rate-reader.service';
import { HeldAssetsService } from '../services/held-assets.service';
import { MarketDataLogService } from '../services/market-data-log.service';
import { MarketDataMetricsService } from '../services/market-data-metrics.service';
import { ProviderBudgetService } from '../services/provider-budget.service';
import { QuoteCollectorService } from '../services/quote-collector.service';
import { QuoteProviderRegistryService, selectQuoteProviders } from '../services/quote-provider-registry.service';
import { QuoteReaderService } from '../services/quote-reader.service';
import { QuoteReadApplication } from './quote-read.application';
import { QuotesChunkApplication } from './quotes-chunk.application';
import { QuotesSweepApplication } from './quotes-sweep.application';
import { ReferenceDataApplication } from './reference-data.application';

@Module({
    imports: [
        ConfigModule.forFeature(marketDataConfig),
        MarketDataDomainModule,
        CatalogApplicationModule,
        QueueModule,
        ObservabilityModule,
        DiscoveryModule
    ],
    providers: [
        QuoteReadApplication,
        QuotesChunkApplication,
        QuotesSweepApplication,
        ReferenceDataApplication,
        QuoteReaderService,
        ExchangeRateReaderService,
        ProviderBudgetService,
        QuoteProviderRegistryService,
        QuoteCollectorService,
        HeldAssetsService,
        MarketDataLogService,
        MarketDataMetricsService,
        EmptyHeldAssetsDriver,
        BrapiQuoteDriver,
        FinnhubQuoteDriver,
        TwelveDataQuoteDriver,
        AlphaVantageQuoteDriver,
        CoinGeckoQuoteDriver,
        TesouroQuoteDriver,
        BcbPtaxDriver,
        MockExchangeRateDriver,
        {
            provide: QUOTE_PROVIDERS,
            inject: [
                marketDataConfig.KEY,
                BrapiQuoteDriver,
                FinnhubQuoteDriver,
                TwelveDataQuoteDriver,
                AlphaVantageQuoteDriver,
                CoinGeckoQuoteDriver,
                TesouroQuoteDriver
            ],
            useFactory: (
                config: ConfigType<typeof marketDataConfig>,
                brapi: BrapiQuoteDriver,
                finnhub: FinnhubQuoteDriver,
                twelvedata: TwelveDataQuoteDriver,
                alphavantage: AlphaVantageQuoteDriver,
                coingecko: CoinGeckoQuoteDriver,
                tesouro: TesouroQuoteDriver
            ): QuoteProviderPort[] =>
                selectQuoteProviders(config, {
                    [QUOTE_PROVIDER_IDS.brapi]: brapi,
                    [QUOTE_PROVIDER_IDS.finnhub]: finnhub,
                    [QUOTE_PROVIDER_IDS.twelvedata]: twelvedata,
                    [QUOTE_PROVIDER_IDS.alphavantage]: alphavantage,
                    [QUOTE_PROVIDER_IDS.coingecko]: coingecko,
                    [QUOTE_PROVIDER_IDS.tesouro]: tesouro
                } satisfies Record<QuoteProviderId, QuoteProviderPort>)
        },
        {
            provide: ExchangeRatePort,
            inject: [marketDataConfig.KEY, BcbPtaxDriver, MockExchangeRateDriver],
            useFactory: (
                config: ConfigType<typeof marketDataConfig>,
                live: BcbPtaxDriver,
                mock: MockExchangeRateDriver
            ): ExchangeRatePort => (config.DRIVER === 'mock' ? mock : live)
        }
    ],
    exports: [QuoteReaderService, ExchangeRateReaderService]
})
export class MarketDataApplicationModule {}
