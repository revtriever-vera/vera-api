import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { UsageSlot } from '../domain/market-data.types';

const PRUNE_BATCH: number = 500;

@Injectable()
export class ProviderUsageRepository extends BareGlobalRepository<'ProviderUsage'> {
    public constructor(database: DatabaseClient) {
        super(database, 'ProviderUsage');
    }

    public async tryIncrement(slot: UsageSlot, calls: number, limit: number): Promise<number | null> {
        const row: { count: number } | undefined = await this.db
            .insertInto('ProviderUsage')
            .values({ id: IdUtil.newId(), ...slot, count: calls })
            .onConflict((conflict) =>
                conflict
                    .columns(['provider', 'windowKind', 'windowStart'])
                    .doUpdateSet((eb) => ({ count: eb('ProviderUsage.count', '+', calls) }))
                    .where((eb) => eb('ProviderUsage.count', '<=', limit - calls))
            )
            .returning('count')
            .executeTakeFirst();
        return row?.count ?? null;
    }

    public async pruneBefore(cutoff: Date): Promise<number> {
        return this.hardDeleteBefore('windowStart', cutoff, PRUNE_BATCH);
    }
}
