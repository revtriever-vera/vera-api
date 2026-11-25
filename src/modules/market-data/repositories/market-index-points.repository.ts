import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { MarketIndexClose, MarketIndexPointRow } from '../domain/market-data.types';

const SERIES_LIMIT: number = 20000;
const UPSERT_BATCH: number = 1000;

@Injectable()
export class MarketIndexPointsRepository extends BareGlobalRepository<'MarketIndexPoints'> {
    public constructor(database: DatabaseClient) {
        super(database, 'MarketIndexPoints');
    }

    public async listSince(symbol: string, from: string): Promise<MarketIndexPointRow[]> {
        return this.selectScoped()
            .selectAll()
            .where('symbol', '=', symbol)
            .where('date', '>=', this.rawSql<Date>`${from}::date`)
            .orderBy('date', 'asc')
            .limit(SERIES_LIMIT)
            .execute();
    }

    public async findLast(symbol: string): Promise<MarketIndexPointRow | null> {
        const rows: MarketIndexPointRow[] = await this.findMany(
            { symbol },
            { limit: 1, orderBy: [{ property: 'date', direction: 'desc' }] }
        );
        return rows[0] ?? null;
    }

    public async upsertMany(symbol: string, source: string, points: readonly MarketIndexClose[]): Promise<void> {
        for (let offset: number = 0; offset < points.length; offset += UPSERT_BATCH) {
            await this.upsertBatch(symbol, source, points.slice(offset, offset + UPSERT_BATCH));
        }
    }

    private async upsertBatch(symbol: string, source: string, batch: readonly MarketIndexClose[]): Promise<void> {
        if (batch.length === 0) {
            return;
        }
        await this.insertBuilder()
            .values(batch.map((point: MarketIndexClose) => ({ symbol, date: point.date, close: point.close, source })))
            .onConflict((conflict) =>
                conflict.columns(['symbol', 'date']).doUpdateSet((eb) => ({
                    close: eb.ref('excluded.close'),
                    source: eb.ref('excluded.source'),
                    fetchedAt: new Date()
                }))
            )
            .execute();
    }
}
