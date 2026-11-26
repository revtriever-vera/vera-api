import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { LlmModule } from '../../../core/llm/llm.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { CatalogApplicationModule } from '../../catalog/application/catalog-application.module';
import { MarketDataApplicationModule } from '../../market-data/application/market-data-application.module';
import { PortfolioEventsApplicationModule } from '../../portfolio-events/application/portfolio-events-application.module';
import { marketDocumentsConfig } from '../config/market-documents.config';
import { MarketDocumentsDomainModule } from '../domain/market-documents-domain.module';
import { DOCUMENT_SOURCES, DocumentSource } from '../domain/market-documents.types';
import { CvmIpeDocumentsDriver } from '../drivers/cvm-ipe-documents.driver';
import { CvmItrDfpDriver } from '../drivers/cvm-itr-dfp.driver';
import { FnetFiiDocumentsDriver } from '../drivers/fnet-fii-documents.driver';
import { MARKET_DOCUMENT_SOURCES, MarketDocumentSourcePort } from '../ports/market-document-source.port';
import { MarketDocumentSourceRegistryService, selectDocumentSources } from '../services/market-document-source-registry.service';
import { MarketDocumentSummarizerService } from '../services/market-document-summarizer.service';
import { MarketDocumentTextService } from '../services/market-document-text.service';
import { MarketDocumentsCollectorService } from '../services/market-documents-collector.service';
import { MarketDocumentsExtractorService } from '../services/market-documents-extractor.service';
import { MarketDocumentsRetentionService } from '../services/market-documents-retention.service';
import { MarketDocumentsLogService } from '../services/market-documents-log.service';
import { MarketDocumentsMetricsService } from '../services/market-documents-metrics.service';
import { MarketDocumentsSweepApplication } from './market-documents-sweep.application';

@Module({
    imports: [
        ConfigModule.forFeature(marketDocumentsConfig),
        MarketDocumentsDomainModule,
        CatalogApplicationModule,
        MarketDataApplicationModule,
        PortfolioEventsApplicationModule,
        LlmModule,
        ObservabilityModule
    ],
    providers: [
        MarketDocumentsSweepApplication,
        MarketDocumentsCollectorService,
        MarketDocumentsExtractorService,
        MarketDocumentTextService,
        MarketDocumentSummarizerService,
        MarketDocumentsRetentionService,
        MarketDocumentSourceRegistryService,
        MarketDocumentsLogService,
        MarketDocumentsMetricsService,
        CvmIpeDocumentsDriver,
        CvmItrDfpDriver,
        FnetFiiDocumentsDriver,
        {
            provide: MARKET_DOCUMENT_SOURCES,
            inject: [marketDocumentsConfig.KEY, CvmIpeDocumentsDriver, CvmItrDfpDriver, FnetFiiDocumentsDriver],
            useFactory: (
                config: ConfigType<typeof marketDocumentsConfig>,
                cvmIpe: CvmIpeDocumentsDriver,
                cvmItr: CvmItrDfpDriver,
                fnet: FnetFiiDocumentsDriver
            ): MarketDocumentSourcePort[] =>
                selectDocumentSources(config, {
                    [DOCUMENT_SOURCES.cvmIpe]: cvmIpe,
                    [DOCUMENT_SOURCES.cvmItr]: cvmItr,
                    [DOCUMENT_SOURCES.b3Fnet]: fnet
                } satisfies Record<DocumentSource, MarketDocumentSourcePort>)
        }
    ],
    exports: [MarketDocumentsSweepApplication]
})
export class MarketDocumentsApplicationModule {}
