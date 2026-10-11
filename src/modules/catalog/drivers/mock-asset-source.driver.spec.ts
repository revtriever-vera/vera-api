import { describe, expect, it } from 'vitest';
import { CATALOG_SOURCES, MARKET_BY_SOURCE } from '../domain/catalog.types';
import { SourceAsset } from '../ports/asset-source.port';
import { MockAssetSourceDriver, MOCK_SOURCES } from './mock-asset-source.driver';

describe('MockAssetSourceDriver', () => {
    it('serves the seed assets of its own market only', async () => {
        const assets: readonly SourceAsset[] = await new MockAssetSourceDriver(CATALOG_SOURCES.tesouro).fetchAll();

        expect(assets.length).toBeGreaterThan(0);
        expect(assets.every((asset: SourceAsset) => asset.kind === 'treasury' && asset.maturityDate !== undefined)).toBe(true);
    });

    it('covers every source with at least one asset', async () => {
        for (const source of MOCK_SOURCES) {
            const assets: readonly SourceAsset[] = await new MockAssetSourceDriver(source).fetchAll();

            expect(assets.length, MARKET_BY_SOURCE[source]).toBeGreaterThan(0);
        }
    });
});
