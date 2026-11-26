import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { MARKET_INDEX_SOURCES, MarketIndexClose, MarketIndexRange, MarketIndexSymbol } from '../domain/market-data.types';
import { MarketIndexSourcePort } from '../ports/market-index-source.port';

export const MOCK_INDEX_BASE: number = 120000;
export const MOCK_INDEX_DAILY_STEP: number = 50;
const DAY_MS: number = 86_400_000;
const EPOCH_MS: number = Date.UTC(2020, 0, 1);
const SATURDAY: number = 6;
const SUNDAY: number = 0;
const RANGE_DAYS: Readonly<Record<MarketIndexRange, number>> = {
    '1mo': 31,
    '3mo': 92,
    '6mo': 183,
    '1y': 366,
    '2y': 731,
    '5y': 1827,
    '10y': 3653,
    max: 3653
};

@Injectable()
export class MockIndexDriver extends MarketIndexSourcePort {
    public readonly source: string = MARKET_INDEX_SOURCES.mock;
    public readonly configured: boolean = true;

    public fetchDaily(_symbol: MarketIndexSymbol, range: MarketIndexRange): Promise<MarketIndexClose[]> {
        const now: Date = new Date();
        const points: MarketIndexClose[] = [];
        for (let back: number = RANGE_DAYS[range]; back >= 0; back -= 1) {
            const day: Date = new Date(now.getTime() - back * DAY_MS);
            const weekday: number = day.getUTCDay();
            if (weekday !== SATURDAY && weekday !== SUNDAY) {
                points.push({
                    date: DateUtil.todayInBrazil(day),
                    close: String(MOCK_INDEX_BASE + Math.floor((day.getTime() - EPOCH_MS) / DAY_MS) * MOCK_INDEX_DAILY_STEP)
                });
            }
        }
        return Promise.resolve(points);
    }
}
