import { CATALOG_SOURCES, CatalogSource, MARKET_BY_SOURCE } from '../domain/catalog.types';
import { AssetSourcePort, SourceAsset } from '../ports/asset-source.port';
import seedAssetsJson from '../data/seed-assets.json';
import { SeedAsset, seedAssetsSchema } from '../validation/curated-maps.schemas';

const SEED_ASSETS: readonly SeedAsset[] = seedAssetsSchema.parse(seedAssetsJson);

export const MOCK_SOURCES: readonly CatalogSource[] = Object.values(CATALOG_SOURCES);

export class MockAssetSourceDriver extends AssetSourcePort {
    public constructor(public readonly source: CatalogSource) {
        super();
    }

    public fetchAll(): Promise<readonly SourceAsset[]> {
        return Promise.resolve(
            SEED_ASSETS.filter((seed: SeedAsset) => seed.market === MARKET_BY_SOURCE[this.source]).map((seed: SeedAsset): SourceAsset => ({
                externalId: seed.externalId,
                symbol: seed.symbol,
                name: seed.name,
                kind: seed.kind,
                currency: seed.currency,
                maturityDate: seed.maturityDate,
                rank: seed.rank,
                raw: { seed: 'true' }
            }))
        );
    }
}
