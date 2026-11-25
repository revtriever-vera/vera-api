import { MarketIndexClose, MarketIndexRange, MarketIndexSymbol } from '../domain/market-data.types';

export abstract class MarketIndexSourcePort {
    public abstract readonly source: string;
    public abstract readonly configured: boolean;
    public abstract fetchDaily(symbol: MarketIndexSymbol, range: MarketIndexRange): Promise<MarketIndexClose[]>;
}
