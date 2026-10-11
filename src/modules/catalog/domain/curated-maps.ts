import etfClassMapJson from '../data/etf-class-map.json';
import usReitMapJson from '../data/us-reit-map.json';
import { CuratedEntry, curatedMapSchema } from '../validation/curated-maps.schemas';

function indexBySymbol(entries: readonly CuratedEntry[]): ReadonlyMap<string, CuratedEntry> {
    return new Map<string, CuratedEntry>(entries.map((entry: CuratedEntry): [string, CuratedEntry] => [entry.symbol, entry]));
}

export const B3_ETF_MAP: ReadonlyMap<string, CuratedEntry> = indexBySymbol(curatedMapSchema.parse(etfClassMapJson));
export const US_REIT_MAP: ReadonlyMap<string, CuratedEntry> = indexBySymbol(curatedMapSchema.parse(usReitMapJson));
