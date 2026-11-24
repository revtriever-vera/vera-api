import { Module, Type } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { QueueModule } from '../../../core/queue/queue.module';
import { UsageModule } from '../../../core/usage/usage.module';
import { CatalogApplicationModule } from '../../catalog/application/catalog-application.module';
import { marketDataConfig } from '../config/market-data.config';
import { MarketDataDomainModule } from '../domain/market-data-domain.module';
import { QuoteProviderId } from '../domain/market-data.types';
import { AlphaVantageQuoteDriver } from '../drivers/alphavantage-quote.driver';
import { BcbPtaxDriver } from '../drivers/bcb-ptax.driver';
import { BrapiQuoteDriver } from '../drivers/brapi-quote.driver';
import { CvmQuoteDriver } from '../drivers/cvm-quote.driver';
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
import { PtaxUsdRateAdapter } from '../services/ptax-usd-rate.adapter';
import { ProviderBudgetService } from '../services/provider-budget.service';
import { QuoteCollectorService } from '../services/quote-collector.service';
import { QuoteProviderRegistryService, selectQuoteProviders } from '../services/quote-provider-registry.service';
import { QuoteReaderService } from '../services/quote-reader.service';
import { QuoteReadApplication } from './quote-read.application';
import { QuotesChunkApplication } from './quotes-chunk.application';
import { QuotesSweepApplication } from './quotes-sweep.application';
import { ReferenceDataApplication } from './reference-data.application';

const LIVE_QUOTE_DRIVERS: Type<QuoteProviderPort>[] = [
    BrapiQuoteDriver,
    FinnhubQuoteDriver,
    TwelveDataQuoteDriver,
    AlphaVantageQuoteDriver,
    CoinGeckoQuoteDriver,
    TesouroQuoteDriver,
    CvmQuoteDriver
];

@Module({
    imports: [
        ConfigModule.forFeature(marketDataConfig),
        MarketDataDomainModule,
        CatalogApplicationModule,
        QueueModule,
        ObservabilityModule,
        DiscoveryModule,
        UsageModule
    ],
    providers: [
        QuoteReadApplication,
        QuotesChunkApplication,
        QuotesSweepApplication,
        ReferenceDataApplication,
        QuoteReaderService,
        ExchangeRateReaderService,
        PtaxUsdRateAdapter,
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
        CvmQuoteDriver,
        BcbPtaxDriver,
        MockExchangeRateDriver,
        {
            provide: QUOTE_PROVIDERS,
            inject: [marketDataConfig.KEY, ...LIVE_QUOTE_DRIVERS],
            useFactory: (config: ConfigType<typeof marketDataConfig>, ...drivers: QuoteProviderPort[]): QuoteProviderPort[] =>
                selectQuoteProviders(
                    config,
                    Object.fromEntries(
                        drivers.map((driver: QuoteProviderPort): [QuoteProviderId, QuoteProviderPort] => [driver.provider, driver])
                    ) as Record<QuoteProviderId, QuoteProviderPort>
                )
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
    exports: [
        QuoteReadApplication,
        QuotesChunkApplication,
        QuotesSweepApplication,
        ReferenceDataApplication,
        QuoteReaderService,
        ExchangeRateReaderService,
        ProviderBudgetService
    ]
})
export class MarketDataApplicationModule {}
