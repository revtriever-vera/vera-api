import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { QueueModule } from '../../../core/queue/queue.module';
import { CatalogApplicationModule } from '../../catalog/application/catalog-application.module';
import { MarketDataApplicationModule } from '../../market-data/application/market-data-application.module';
import { portfolioEventsConfig } from '../config/portfolio-events.config';
import { PortfolioEventsDomainModule } from '../domain/portfolio-events-domain.module';
import { EventSource, EVENT_SOURCES } from '../domain/portfolio-events.types';
import { FnetFiiNoticesDriver } from '../drivers/fnet-fii-notices.driver';
import { PORTFOLIO_EVENT_SOURCES, PortfolioEventSourcePort } from '../ports/portfolio-event-source.port';
import { PortfolioEventSourceRegistryService, selectEventSources } from '../services/portfolio-event-source-registry.service';
import { PortfolioEventsLogService } from '../services/portfolio-events-log.service';
import { PortfolioEventsMetricsService } from '../services/portfolio-events-metrics.service';
import { PortfolioEventsReaderService } from '../services/portfolio-events-reader.service';
import { IssuerLinksApplication } from './issuer-links.application';
import { PortfolioEventsBatchApplication } from './portfolio-events-batch.application';
import { PortfolioEventsSweepApplication } from './portfolio-events-sweep.application';

@Module({
    imports: [
        ConfigModule.forFeature(portfolioEventsConfig),
        PortfolioEventsDomainModule,
        CatalogApplicationModule,
        MarketDataApplicationModule,
        QueueModule,
        ObservabilityModule
    ],
    providers: [
        IssuerLinksApplication,
        PortfolioEventsBatchApplication,
        PortfolioEventsSweepApplication,
        PortfolioEventSourceRegistryService,
        PortfolioEventsLogService,
        PortfolioEventsMetricsService,
        PortfolioEventsReaderService,
        FnetFiiNoticesDriver,
        {
            provide: PORTFOLIO_EVENT_SOURCES,
            inject: [portfolioEventsConfig.KEY, FnetFiiNoticesDriver],
            useFactory: (config: ConfigType<typeof portfolioEventsConfig>, fnet: FnetFiiNoticesDriver): PortfolioEventSourcePort[] =>
                selectEventSources(config, { [EVENT_SOURCES.fnet]: fnet } satisfies Record<EventSource, PortfolioEventSourcePort>)
        }
    ],
    exports: [IssuerLinksApplication, PortfolioEventsBatchApplication, PortfolioEventsSweepApplication, PortfolioEventsReaderService]
})
export class PortfolioEventsApplicationModule {}
