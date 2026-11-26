import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { QueueModule } from '../../../core/queue/queue.module';
import { catalogConfig } from '../config/catalog.config';
import { CatalogDomainModule } from '../domain/catalog-domain.module';
import { CATALOG_SOURCES, CatalogSource } from '../domain/catalog.types';
import { CoinGeckoMarketsDriver } from '../drivers/coingecko-markets.driver';
import { CvmFundCatalogDriver } from '../drivers/cvm-fund-catalog.driver';
import { CvmInstrumentsDriver } from '../drivers/cvm-instruments.driver';
import { FinnhubSymbolsDriver } from '../drivers/finnhub-symbols.driver';
import { TesouroTitlesDriver } from '../drivers/tesouro-titles.driver';
import { ASSET_SOURCES, AssetSourcePort } from '../ports/asset-source.port';
import { AssetCatalogService } from '../services/asset-catalog.service';
import { AssetSourceRegistryService, selectAssetSources } from '../services/asset-source-registry.service';
import { CatalogLogService } from '../services/catalog-log.service';
import { CatalogMetricsService } from '../services/catalog-metrics.service';
import { IssuerLinkSourceService } from '../services/issuer-link-source.service';
import { CvmDailyInformeReaderService } from '../services/cvm-daily-informe-reader.service';
import { TesouroCsvReaderService } from '../services/tesouro-csv-reader.service';
import { AssetSearchApplication } from './asset-search.application';
import { CatalogSyncApplication } from './catalog-sync.application';

@Module({
    imports: [ConfigModule.forFeature(catalogConfig), CatalogDomainModule, QueueModule, ObservabilityModule],
    providers: [
        AssetSearchApplication,
        CatalogSyncApplication,
        AssetCatalogService,
        AssetSourceRegistryService,
        CatalogLogService,
        CatalogMetricsService,
        TesouroCsvReaderService,
        CvmDailyInformeReaderService,
        IssuerLinkSourceService,
        CvmInstrumentsDriver,
        FinnhubSymbolsDriver,
        CoinGeckoMarketsDriver,
        TesouroTitlesDriver,
        CvmFundCatalogDriver,
        {
            provide: ASSET_SOURCES,
            inject: [
                catalogConfig.KEY,
                CvmInstrumentsDriver,
                FinnhubSymbolsDriver,
                CoinGeckoMarketsDriver,
                TesouroTitlesDriver,
                CvmFundCatalogDriver
            ],
            useFactory: (
                config: ConfigType<typeof catalogConfig>,
                b3: CvmInstrumentsDriver,
                us: FinnhubSymbolsDriver,
                crypto: CoinGeckoMarketsDriver,
                tesouro: TesouroTitlesDriver,
                cvmFunds: CvmFundCatalogDriver
            ): AssetSourcePort[] =>
                selectAssetSources(config, {
                    [CATALOG_SOURCES.b3]: b3,
                    [CATALOG_SOURCES.us]: us,
                    [CATALOG_SOURCES.crypto]: crypto,
                    [CATALOG_SOURCES.tesouro]: tesouro,
                    [CATALOG_SOURCES.cvmFunds]: cvmFunds
                } satisfies Record<CatalogSource, AssetSourcePort>)
        }
    ],
    exports: [
        AssetSearchApplication,
        CatalogSyncApplication,
        AssetCatalogService,
        TesouroCsvReaderService,
        CvmDailyInformeReaderService,
        IssuerLinkSourceService
    ]
})
export class CatalogApplicationModule {}
