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

const LIVE: Record<CatalogSource, AssetSourcePort> = {
    b3: live('b3'),
    us: live('us'),
    crypto: live('crypto'),
    tesouro: live('tesouro'),
    cvm_funds: live('cvm_funds')
};

function config(partial: Partial<Config>): Config {
    return { CATALOG_DRIVER: 'live', ...partial } as Config;
}

describe('selectAssetSources', () => {
    it('serves the five mock drivers in mock mode, whatever the keys', () => {
        const sources: AssetSourcePort[] = selectAssetSources(config({ CATALOG_DRIVER: 'mock', FINNHUB_API_KEY: 'x' }), LIVE);

        expect(sources.map((source: AssetSourcePort) => source.source)).toEqual(['b3', 'us', 'crypto', 'tesouro', 'cvm_funds']);
        expect(sources.every((source: AssetSourcePort) => source instanceof MockAssetSourceDriver)).toBe(true);
    });

    it('registers the CVM drivers always and the others only when their URL or key is configured', () => {
        const sources: AssetSourcePort[] = selectAssetSources(
            config({ FINNHUB_API_KEY: 'chave-falsa', TESOURO_PRICES_CSV_URL: 'https://tesouro.example/p.csv' }),
            LIVE
        );

        expect(sources.map((source: AssetSourcePort) => source.source)).toEqual(['b3', 'us', 'tesouro', 'cvm_funds']);
    });

    it('registers every live driver when everything is configured and none otherwise', () => {
        const all: AssetSourcePort[] = selectAssetSources(
            config({
                TESOURO_PRICES_CSV_URL: 'https://tesouro.example/p.csv',
                FINNHUB_API_KEY: 'a',
                COINGECKO_API_KEY: 'b'
            }),
            LIVE
        );

        expect(all).toHaveLength(5);
        expect(selectAssetSources(config({}), LIVE).map((source: AssetSourcePort) => source.source)).toEqual(['b3', 'cvm_funds']);
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
