import { HashUtil } from '../../../shared/utils/hash.util';
import popularAssetsJson from '../data/popular-assets.json';
import { SourceAsset } from '../ports/asset-source.port';
import { PopularAssets, popularAssetsSchema } from '../validation/curated-maps.schemas';
import { AssetClassification, classifyAsset } from './asset-classification';
import { AssetWrite, CatalogMarket, MARKET_ATTRIBUTES, MarketAttributes } from './catalog.types';

const POPULAR_ASSETS: PopularAssets = popularAssetsSchema.parse(popularAssetsJson);

const POPULAR_RANK_BY_KEY: ReadonlyMap<string, number> = new Map<string, number>(
    Object.entries(POPULAR_ASSETS).flatMap(([group, entries]) =>
        entries.map((entry, index): [string, number] => [`${group}|${entry.market}|${entry.externalId}`, index + 1])
    )
);

export function popularRankOf(typeGroup: string, market: CatalogMarket, externalId: string): number | null {
    return POPULAR_RANK_BY_KEY.get(`${typeGroup}|${market}|${externalId}`) ?? null;
}

function hashOf(write: Omit<AssetWrite, 'sourceHash'>): string {
    return HashUtil.sha256(JSON.stringify(Object.entries(write).sort(([left], [right]) => left.localeCompare(right))));
}

function writeOf(market: CatalogMarket, source: SourceAsset, classification: AssetClassification): AssetWrite {
    const attributes: MarketAttributes = MARKET_ATTRIBUTES[market];
    const unhashed: Omit<AssetWrite, 'sourceHash'> = {
        market,
        externalId: source.externalId,
        symbol: source.symbol,
        name: source.name,
        kind: classification.kind,
        typeGroup: classification.typeGroup,
        suggestedClassKey: classification.suggestedClassKey,
        dollarExposure: classification.dollarExposure,
        currency: source.currency.toUpperCase().slice(0, 3),
        quotesProvider: attributes.quotesProvider,
        quantityDecimals: attributes.quantityDecimals,
        maturityDate: source.maturityDate ?? null,
        popularRank: popularRankOf(classification.typeGroup, market, source.externalId),
        rank: source.rank ?? null
    };
    return { ...unhashed, sourceHash: hashOf(unhashed) };
}

export function buildAssetWrites(market: CatalogMarket, sources: readonly SourceAsset[]): AssetWrite[] {
    const byExternalId: Map<string, AssetWrite> = new Map<string, AssetWrite>();
    for (const source of sources) {
        const classification: AssetClassification | null = classifyAsset(market, source);
        if (classification !== null) {
            byExternalId.set(source.externalId, writeOf(market, source, classification));
        }
    }
    return [...byExternalId.values()];
}
