import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { RateWrite, StoredRate } from '../domain/market-data.types';

@Injectable()
export class ExchangeRatesRepository extends BareGlobalRepository<'ExchangeRates'> {
    public constructor(database: DatabaseClient) {
        super(database, 'ExchangeRates');
    }

    public async upsertRate(rate: RateWrite, fetchedAt: Date): Promise<void> {
        await this.db
            .insertInto('ExchangeRates')
            .values({
                id: IdUtil.newId(),
                currency: rate.currency,
                date: rate.date,
                brlPerUnit: rate.brlPerUnit,
                source: rate.source,
                fetchedAt
            })
            .onConflict((conflict) =>
                conflict.columns(['currency', 'date']).doUpdateSet({ brlPerUnit: rate.brlPerUnit, source: rate.source, fetchedAt })
            )
            .execute();
    }

    public async findLatestOnOrBefore(currency: string, isoDate: string): Promise<StoredRate | null> {
        const rows: StoredRate[] = await this.db
            .selectFrom('ExchangeRates')
            .select(['currency', 'brlPerUnit', 'source', sql<string>`to_char("date", 'YYYY-MM-DD')`.as('date')])
            .where('currency', '=', currency)
            .where('date', '<=', sql<Date>`${isoDate}::date`)
            .orderBy('date', 'desc')
            .limit(1)
            .execute();
        return rows[0] ?? null;
    }
}
