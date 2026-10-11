import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { SeriesPoint } from '../domain/curve/curve.types';
import { IndexSeriesPointRow } from '../domain/fixed-income.types';

const SERIES_LIMIT: number = 50000;
const UPSERT_BATCH: number = 1000;

@Injectable()
export class IndexSeriesPointsRepository extends BareGlobalRepository<'IndexSeriesPoints'> {
    public constructor(database: DatabaseClient) {
        super(database, 'IndexSeriesPoints');
    }

    public async listSeries(series: string): Promise<IndexSeriesPointRow[]> {
        return this.findMany({ series }, { limit: SERIES_LIMIT, orderBy: [{ property: 'date', direction: 'asc' }] });
    }

    public async findLast(series: string): Promise<IndexSeriesPointRow | null> {
        const rows: IndexSeriesPointRow[] = await this.findMany(
            { series },
            { limit: 1, orderBy: [{ property: 'date', direction: 'desc' }] }
        );
        return rows[0] ?? null;
    }

    public async upsertMany(series: string, source: string, points: readonly SeriesPoint[]): Promise<void> {
        for (let offset: number = 0; offset < points.length; offset += UPSERT_BATCH) {
            await this.upsertBatch(series, source, points.slice(offset, offset + UPSERT_BATCH));
        }
    }

    private async upsertBatch(series: string, source: string, batch: readonly SeriesPoint[]): Promise<void> {
        await this.db
            .insertInto(this.table)
            .values(batch.map((point: SeriesPoint) => ({ series, date: point.date, value: point.value, source })))
            .onConflict((conflict) =>
                conflict.columns(['series', 'date']).doUpdateSet((eb) => ({
                    value: eb.ref('excluded.value'),
                    source: eb.ref('excluded.source'),
                    fetchedAt: new Date()
                }))
            )
            .execute();
    }
}
