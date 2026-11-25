import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { MarketIndexPointsRepository } from '../repositories/market-index-points.repository';
import { MarketIndexClose, MarketIndexPointRow } from './market-data.types';

function toClose(row: MarketIndexPointRow): MarketIndexClose {
    return { date: DateUtil.onlyLocalDateString(row.date), close: row.close };
}

@Injectable()
export class MarketIndexDomain {
    public constructor(private readonly points: MarketIndexPointsRepository) {}

    public async loadSince(symbol: string, from: string): Promise<MarketIndexClose[]> {
        return (await this.points.listSince(symbol, from)).map(toClose);
    }

    public async lastDate(symbol: string): Promise<string | null> {
        const row: MarketIndexPointRow | null = await this.points.findLast(symbol);
        return row === null ? null : DateUtil.onlyLocalDateString(row.date);
    }

    public async save(symbol: string, source: string, points: readonly MarketIndexClose[]): Promise<number> {
        await this.points.upsertMany(symbol, source, points);
        return points.length;
    }
}
