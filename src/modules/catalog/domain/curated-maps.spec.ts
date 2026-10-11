import { describe, expect, it } from 'vitest';
import etfClassMapJson from '../data/etf-class-map.json';
import popularAssetsJson from '../data/popular-assets.json';
import seedAssetsJson from '../data/seed-assets.json';
import usReitMapJson from '../data/us-reit-map.json';
import {
    CuratedEntry,
    curatedMapSchema,
    popularAssetsSchema,
    PopularAssets,
    SeedAsset,
    seedAssetsSchema
} from '../validation/curated-maps.schemas';
import { B3_ETF_MAP, US_REIT_MAP } from './curated-maps';

const MAPS: ReadonlyArray<readonly [string, unknown]> = [
    ['etf-class-map.json', etfClassMapJson],
    ['us-reit-map.json', usReitMapJson]
];

describe.each(MAPS)('%s', (_name: string, json: unknown) => {
    it('passes the schema with class keys from the standard set', () => {
        expect(curatedMapSchema.safeParse(json).success).toBe(true);
    });

    it('has no duplicated symbol and is sorted by symbol', () => {
        const symbols: string[] = (json as CuratedEntry[]).map((entry: CuratedEntry) => entry.symbol);

        expect(new Set(symbols).size).toBe(symbols.length);
        expect(symbols).toEqual([...symbols].sort());
    });
});

describe('curated maps', () => {
    it('indexes both maps by symbol', () => {
        expect(B3_ETF_MAP.get('IVVB11')).toEqual({ symbol: 'IVVB11', classKey: 'acoes_eua', dollarExposure: true });
        expect(US_REIT_MAP.get('VNQ')?.classKey).toBe('reits');
    });

    it('maps every US REIT entry to reits', () => {
        expect([...US_REIT_MAP.values()].every((entry: CuratedEntry) => entry.classKey === 'reits')).toBe(true);
    });

    it('marks dollar exposure only on ETFs that hold US assets', () => {
        const exposed: string[] = [...B3_ETF_MAP.values()]
            .filter((entry: CuratedEntry) => entry.dollarExposure)
            .map((entry: CuratedEntry) => entry.symbol);

        expect(exposed).toEqual(['IVVB11', 'NASD11', 'SPXI11']);
    });
});

describe('seed and popular assets', () => {
    it('keeps the seed assets valid and unique by market and external id', () => {
        const seed: SeedAsset[] = seedAssetsSchema.parse(seedAssetsJson);
        const keys: string[] = seed.map((asset: SeedAsset) => `${asset.market}|${asset.externalId}`);

        expect(new Set(keys).size).toBe(keys.length);
    });

    it('only references assets that exist in the seed', () => {
        const seed: SeedAsset[] = seedAssetsSchema.parse(seedAssetsJson);
        const known: Set<string> = new Set(seed.map((asset: SeedAsset) => `${asset.market}|${asset.externalId}`));
        const popular: PopularAssets = popularAssetsSchema.parse(popularAssetsJson);

        const missing: string[] = Object.values(popular)
            .flat()
            .map((entry) => `${entry.market}|${entry.externalId}`)
            .filter((key: string) => !known.has(key));

        expect(missing).toEqual([]);
    });

    it('includes the assets of the prototype example portfolio', () => {
        const seed: SeedAsset[] = seedAssetsSchema.parse(seedAssetsJson);
        const symbols: Set<string> = new Set(seed.map((asset: SeedAsset) => asset.symbol));

        for (const symbol of ['ITUB4', 'WEGE3', 'PETR4', 'HGLG11', 'KNRI11', 'IVVB11', 'VOO', 'AAPL', 'MSFT', 'O', 'VNQ', 'BTC', 'ETH']) {
            expect(symbols.has(symbol)).toBe(true);
        }
    });
});
