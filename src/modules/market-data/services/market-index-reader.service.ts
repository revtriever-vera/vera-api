import { Injectable } from '@nestjs/common';
import { MarketIndexDomain } from '../domain/market-index.domain';
import { MARKET_INDEX_READINGS, MARKET_INDEX_SYMBOLS, MarketIndexClose, MarketIndexReading } from '../domain/market-data.types';
import { MarketIndexSourcePort } from '../ports/market-index-source.port';

export type { MarketIndexClose, MarketIndexReading };

@Injectable()
export class MarketIndexReaderService {
    public constructor(
        private readonly source: MarketIndexSourcePort,
        private readonly indexes: MarketIndexDomain
    ) {}

    public async ibovespaSince(from: string): Promise<MarketIndexReading> {
        const points: MarketIndexClose[] = await this.indexes.loadSince(MARKET_INDEX_SYMBOLS.ibovespa, from);
        if (points.length > 0) {
            return { state: MARKET_INDEX_READINGS.ok, source: this.source.source, points };
        }
        const state: MarketIndexReading['state'] = this.source.configured
            ? MARKET_INDEX_READINGS.noData
            : MARKET_INDEX_READINGS.notConfigured;
        return { state, source: this.source.source, points };
    }
}
