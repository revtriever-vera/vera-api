import { ConfigType } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { catalogConfig } from '../config/catalog.config';
import { CatalogSource } from '../domain/catalog.types';
import { MockAssetSourceDriver } from '../drivers/mock-asset-source.driver';
import { AssetSourcePort } from '../ports/asset-source.port';
import { AssetSourceRegistryService, selectAssetSources } from './asset-source-registry.service';

type Config = ConfigType<typeof catalogConfig>;

function live(source: CatalogSource): AssetSourcePort {
    return { source, fetchAll: async () => Promise.resolve([]) };
}

const LIVE: Record<CatalogSource, AssetSourcePort> = { b3: live('b3'), us: live('us'), crypto: live('crypto'), tesouro: live('tesouro') };

function config(partial: Partial<Config>): Config {
    return { CATALOG_DRIVER: 'live', ...partial } as Config;
}

describe('selectAssetSources', () => {
    it('serves the four mock drivers in mock mode, whatever the keys', () => {
        const sources: AssetSourcePort[] = selectAssetSources(config({ CATALOG_DRIVER: 'mock', FINNHUB_API_KEY: 'x' }), LIVE);

        expect(sources.map((source: AssetSourcePort) => source.source)).toEqual(['b3', 'us', 'crypto', 'tesouro']);
        expect(sources.every((source: AssetSourcePort) => source instanceof MockAssetSourceDriver)).toBe(true);
    });

    it('registers a live driver only when its URL or key is configured', () => {
        const sources: AssetSourcePort[] = selectAssetSources(
            config({ FINNHUB_API_KEY: 'chave-falsa', TESOURO_PRICES_CSV_URL: 'https://tesouro.example/p.csv' }),
            LIVE
        );

        expect(sources.map((source: AssetSourcePort) => source.source)).toEqual(['us', 'tesouro']);
    });

    it('registers every live driver when everything is configured and none otherwise', () => {
        const all: AssetSourcePort[] = selectAssetSources(
            config({
                B3_INSTRUMENTS_URL: 'https://b3.example/i.csv',
                TESOURO_PRICES_CSV_URL: 'https://tesouro.example/p.csv',
                FINNHUB_API_KEY: 'a',
                COINGECKO_API_KEY: 'b'
            }),
            LIVE
        );

        expect(all).toHaveLength(4);
        expect(selectAssetSources(config({}), LIVE)).toEqual([]);
    });
});

describe('AssetSourceRegistryService', () => {
    it('finds a port by source and lists the available sources', () => {
        const registry: AssetSourceRegistryService = new AssetSourceRegistryService([LIVE.b3, LIVE.us]);

        expect(registry.portFor('b3')).toBe(LIVE.b3);
        expect(registry.portFor('crypto')).toBeNull();
        expect(registry.available()).toEqual(['b3', 'us']);
    });
});
