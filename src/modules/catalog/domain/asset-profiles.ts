import assetProfilesJson from '../data/asset-profiles.json';
import { AssetProfileEntry, assetProfilesSchema } from '../validation/curated-maps.schemas';
import { MARKETS } from './catalog.types';

export interface AssetProfile {
    readonly sector: string | null;
    readonly issuerGroupId: string | null;
}

const NO_PROFILE: AssetProfile = { sector: null, issuerGroupId: null };
const TREASURY_PROFILE: AssetProfile = { sector: null, issuerGroupId: 'tesouro-nacional' };

export function assetProfileKey(market: string, symbol: string): string {
    return `${market}|${symbol}`;
}

export const ASSET_PROFILES: ReadonlyMap<string, AssetProfileEntry> = new Map<string, AssetProfileEntry>(
    assetProfilesSchema
        .parse(assetProfilesJson)
        .map((entry: AssetProfileEntry): [string, AssetProfileEntry] => [assetProfileKey(entry.market, entry.symbol), entry])
);

export function profileOf(market: string, symbol: string): AssetProfile {
    if (market === MARKETS.tesouro) {
        return TREASURY_PROFILE;
    }
    const entry: AssetProfileEntry | undefined = ASSET_PROFILES.get(assetProfileKey(market, symbol));
    return entry === undefined ? NO_PROFILE : { sector: entry.sector, issuerGroupId: entry.issuerGroupId };
}
