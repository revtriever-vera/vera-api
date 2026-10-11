import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { QueueModule } from '../../../core/queue/queue.module';
import { catalogConfig } from '../config/catalog.config';
import { CatalogDomainModule } from '../domain/catalog-domain.module';
import { CATALOG_SOURCES, CatalogSource } from '../domain/catalog.types';
import { B3InstrumentsDriver } from '../drivers/b3-instruments.driver';
import { CoinGeckoMarketsDriver } from '../drivers/coingecko-markets.driver';
import { FinnhubSymbolsDriver } from '../drivers/finnhub-symbols.driver';
import { TesouroTitlesDriver } from '../drivers/tesouro-titles.driver';
import { ASSET_SOURCES, AssetSourcePort } from '../ports/asset-source.port';
import { AssetCatalogService } from '../services/asset-catalog.service';
import { AssetSourceRegistryService, selectAssetSources } from '../services/asset-source-registry.service';
import { CatalogLogService } from '../services/catalog-log.service';
import { CatalogMetricsService } from '../services/catalog-metrics.service';
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
        B3InstrumentsDriver,
        FinnhubSymbolsDriver,
        CoinGeckoMarketsDriver,
        TesouroTitlesDriver,
        {
            provide: ASSET_SOURCES,
            inject: [catalogConfig.KEY, B3InstrumentsDriver, FinnhubSymbolsDriver, CoinGeckoMarketsDriver, TesouroTitlesDriver],
            useFactory: (
                config: ConfigType<typeof catalogConfig>,
                b3: B3InstrumentsDriver,
                us: FinnhubSymbolsDriver,
                crypto: CoinGeckoMarketsDriver,
                tesouro: TesouroTitlesDriver
            ): AssetSourcePort[] =>
                selectAssetSources(config, {
                    [CATALOG_SOURCES.b3]: b3,
                    [CATALOG_SOURCES.us]: us,
                    [CATALOG_SOURCES.crypto]: crypto,
                    [CATALOG_SOURCES.tesouro]: tesouro
                } satisfies Record<CatalogSource, AssetSourcePort>)
        }
    ],
    exports: [AssetSearchApplication, CatalogSyncApplication, AssetCatalogService, TesouroCsvReaderService]
})
export class CatalogApplicationModule {}
