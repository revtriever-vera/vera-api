import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { catalogConfig } from '../config/catalog.config';
import { CATALOG_SOURCES, CatalogSource } from '../domain/catalog.types';
import { MOCK_SOURCES, MockAssetSourceDriver } from '../drivers/mock-asset-source.driver';
import { ASSET_SOURCES, AssetSourcePort } from '../ports/asset-source.port';

type CatalogSettings = ConfigType<typeof catalogConfig>;

const LIVE_REQUIREMENTS: Readonly<Record<CatalogSource, (config: CatalogSettings) => boolean>> = {
    b3: (config: CatalogSettings): boolean => config.B3_INSTRUMENTS_URL !== undefined,
    us: (config: CatalogSettings): boolean => config.FINNHUB_API_KEY !== undefined,
    crypto: (config: CatalogSettings): boolean => config.COINGECKO_API_KEY !== undefined,
    tesouro: (config: CatalogSettings): boolean => config.TESOURO_PRICES_CSV_URL !== undefined
};

export function selectAssetSources(config: CatalogSettings, live: Readonly<Record<CatalogSource, AssetSourcePort>>): AssetSourcePort[] {
    if (config.CATALOG_DRIVER === 'mock') {
        return MOCK_SOURCES.map((source: CatalogSource): AssetSourcePort => new MockAssetSourceDriver(source));
    }
    return Object.values(CATALOG_SOURCES)
        .filter((source: CatalogSource) => LIVE_REQUIREMENTS[source](config))
        .map((source: CatalogSource): AssetSourcePort => live[source]);
}

@Injectable()
export class AssetSourceRegistryService {
    private readonly bySource: ReadonlyMap<CatalogSource, AssetSourcePort>;

    public constructor(@Inject(ASSET_SOURCES) sources: readonly AssetSourcePort[]) {
        this.bySource = new Map<CatalogSource, AssetSourcePort>(
            sources.map((port: AssetSourcePort): [CatalogSource, AssetSourcePort] => [port.source, port])
        );
    }

    public portFor(source: CatalogSource): AssetSourcePort | null {
        return this.bySource.get(source) ?? null;
    }

    public available(): CatalogSource[] {
        return [...this.bySource.keys()];
    }
}
