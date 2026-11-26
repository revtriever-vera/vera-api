import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { FundQuotePoint } from '../domain/market-data.types';

const UPSERT_BATCH: number = 1000;
const READ_LIMIT: number = 2000;
const DELETE_BATCH: number = 1000;

@Injectable()
export class FundQuotePointsRepository extends BareGlobalRepository<'FundQuotePoints'> {
    public constructor(database: DatabaseClient) {
        super(database, 'FundQuotePoints');
    }

    public async listBetween(assetId: string, from: string, to: string): Promise<FundQuotePoint[]> {
        return this.selectScoped()
            .select([this.rawSql<string>`to_char("date", 'YYYY-MM-DD')`.as('date'), this.rawSql<string>`"quota"::text`.as('quota')])
            .where('assetId', '=', assetId)
            .where('date', '>=', this.rawSql<Date>`${from}::date`)
            .where('date', '<=', this.rawSql<Date>`${to}::date`)
            .orderBy('date', 'asc')
            .limit(READ_LIMIT)
            .execute();
    }

    public async upsertMany(assetId: string, points: readonly FundQuotePoint[], fetchedAt: Date): Promise<void> {
        for (let offset: number = 0; offset < points.length; offset += UPSERT_BATCH) {
            await this.upsertBatch(assetId, points.slice(offset, offset + UPSERT_BATCH), fetchedAt);
        }
    }

    public async pruneBefore(cutoff: Date): Promise<number> {
        let deleted: number = 0;
        let removed: number = await this.hardDeleteBefore('date', cutoff, DELETE_BATCH);
        while (removed > 0) {
            deleted += removed;
            removed = removed < DELETE_BATCH ? 0 : await this.hardDeleteBefore('date', cutoff, DELETE_BATCH);
        }
        return deleted;
    }

    public async removeForAssets(assetIds: readonly string[]): Promise<number> {
        return assetIds.length === 0 ? 0 : this.hardDeleteWhere({ assetId: assetIds }, DELETE_BATCH);
    }

    private async upsertBatch(assetId: string, batch: readonly FundQuotePoint[], fetchedAt: Date): Promise<void> {
        if (batch.length === 0) {
            return;
        }
        await this.insertBuilder()
            .values(
                batch.map((point: FundQuotePoint) => ({ id: IdUtil.newId(), assetId, date: point.date, quota: point.quota, fetchedAt }))
            )
            .onConflict((conflict) =>
                conflict.columns(['assetId', 'date']).doUpdateSet((eb) => ({
                    quota: eb.ref('excluded.quota'),
                    fetchedAt: eb.ref('excluded.fetchedAt')
                }))
            )
            .execute();
    }
}
