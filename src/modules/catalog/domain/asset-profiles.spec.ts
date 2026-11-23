import { describe, expect, it } from 'vitest';
import assetProfilesJson from '../data/asset-profiles.json';
import popularAssetsJson from '../data/popular-assets.json';
import seedAssetsJson from '../data/seed-assets.json';
import groupsJson from '../../issuers/data/groups.json';
import { AssetProfileEntry, assetProfilesSchema, popularAssetsSchema, seedAssetsSchema } from '../validation/curated-maps.schemas';
import { ASSET_PROFILES, assetProfileKey, profileOf } from './asset-profiles';
import { SECTORS } from './sectors';

const ENTRIES: AssetProfileEntry[] = assetProfilesSchema.parse(assetProfilesJson);

describe('asset-profiles.json', () => {
    it('passes the schema', () => {
        expect(assetProfilesSchema.safeParse(assetProfilesJson).success).toBe(true);
    });

    it('has no repeated market and symbol and is sorted by market and symbol', () => {
        const keys: string[] = ENTRIES.map((entry: AssetProfileEntry) => assetProfileKey(entry.market, entry.symbol));

        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).toEqual([...keys].sort());
    });

    it('rejects a sector outside the closed list and a free text sector', () => {
        const entry = { market: 'B3', symbol: 'ITUB4', sector: 'Bancos', issuerGroupId: null };

        expect(assetProfilesSchema.safeParse([entry]).success).toBe(false);
        expect(assetProfilesSchema.safeParse([{ ...entry, sector: SECTORS.financeiro }]).success).toBe(true);
    });

    it('rejects a repeated key through the index size', () => {
        expect(ASSET_PROFILES.size).toBe(ENTRIES.length);
    });

    it('points every issuerGroupId to a group of the issuers list', () => {
        const groups: Set<string> = new Set(groupsJson.map((group: { id: string }) => group.id));
        const unknown: string[] = ENTRIES.filter(
            (entry: AssetProfileEntry) => entry.issuerGroupId !== null && !groups.has(entry.issuerGroupId)
        ).map((entry: AssetProfileEntry) => entry.symbol);

        expect(unknown).toEqual([]);
    });

    it('covers every popular asset', () => {
        const seed = seedAssetsSchema.parse(seedAssetsJson);
        const symbolOf: Map<string, string> = new Map(seed.map((asset) => [`${asset.market}|${asset.externalId}`, asset.symbol]));
        const missing: string[] = [];
        for (const items of Object.values(popularAssetsSchema.parse(popularAssetsJson))) {
            for (const item of items) {
                const symbol: string = symbolOf.get(`${item.market}|${item.externalId}`) ?? item.externalId;
                missing.push(...(profileOf(item.market, symbol).sector === null && item.market !== 'TESOURO' ? [symbol] : []));
            }
        }

        expect(missing).toEqual([]);
    });

    it('covers every seed asset that is not Tesouro', () => {
        const missing: string[] = seedAssetsSchema
            .parse(seedAssetsJson)
            .filter((asset) => asset.market !== 'TESOURO' && !ASSET_PROFILES.has(assetProfileKey(asset.market, asset.symbol)))
            .map((asset) => asset.symbol);

        expect(missing).toEqual([]);
    });
});

describe('profileOf', () => {
    it('gives sector and group of a listed asset', () => {
        expect(profileOf('B3', 'ITUB4')).toEqual({ sector: 'financeiro', issuerGroupId: 'itau-unibanco' });
        expect(profileOf('B3', 'BBAS3').issuerGroupId).toBe('banco-do-brasil');
    });

    it('puts the BDR and the share of the same company in the same group', () => {
        expect(profileOf('B3', 'AAPL34').issuerGroupId).toBe(profileOf('US', 'AAPL').issuerGroupId);
    });

    it('leaves the group empty for an ETF or a FII', () => {
        expect(profileOf('B3', 'BOVA11')).toEqual({ sector: 'etf_indice', issuerGroupId: null });
        expect(profileOf('B3', 'HGLG11')).toEqual({ sector: 'imobiliario_logistica', issuerGroupId: null });
    });

    it('gives every Tesouro Direto bond the group of the National Treasury without sector', () => {
        expect(profileOf('TESOURO', 'Tesouro Selic 2029')).toEqual({ sector: null, issuerGroupId: 'tesouro-nacional' });
    });

    it('answers no sector and no group for an asset without profile', () => {
        expect(profileOf('B3', 'ZZZZ3')).toEqual({ sector: null, issuerGroupId: null });
    });
});
