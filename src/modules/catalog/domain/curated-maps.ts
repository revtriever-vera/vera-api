import etfClassMapJson from '../data/etf-class-map.json';
import usReitMapJson from '../data/us-reit-map.json';
import { CuratedEntry, CuratedEtfEntry, curatedEtfMapSchema, curatedMapSchema } from '../validation/curated-maps.schemas';

function indexBySymbol<T extends CuratedEntry>(entries: readonly T[]): ReadonlyMap<string, T> {
    return new Map<string, T>(entries.map((entry: T): [string, T] => [entry.symbol, entry]));
}

export const B3_ETF_MAP: ReadonlyMap<string, CuratedEtfEntry> = indexBySymbol(curatedEtfMapSchema.parse(etfClassMapJson));
export const US_REIT_MAP: ReadonlyMap<string, CuratedEntry> = indexBySymbol(curatedMapSchema.parse(usReitMapJson));
