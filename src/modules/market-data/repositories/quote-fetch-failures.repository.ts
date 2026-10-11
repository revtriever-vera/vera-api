import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { FailureWrite } from '../domain/market-data.types';

@Injectable()
export class QuoteFetchFailuresRepository extends BareGlobalRepository<'QuoteFetchFailures'> {
    public constructor(database: DatabaseClient) {
        super(database, 'QuoteFetchFailures');
    }

    public async record(failures: readonly FailureWrite[]): Promise<void> {
        await this.createManyRows(failures.map((failure: FailureWrite) => ({ id: IdUtil.newId(), ...failure })));
    }

    public async resolveForAssets(assetIds: readonly string[], resolvedAt: Date): Promise<number> {
        if (assetIds.length === 0) {
            return 0;
        }
        const rows: unknown[] = await this.updateManyRows({ assetId: [...assetIds], resolvedAt: null }, { resolvedAt });
        return rows.length;
    }

    public async countOpen(): Promise<number> {
        const row: { total: string } | undefined = await this.db
            .selectFrom('QuoteFetchFailures')
            .select((eb) => eb.fn.countAll<string>().as('total'))
            .where('resolvedAt', 'is', null)
            .executeTakeFirst();
        return Number(row?.total ?? 0);
    }
}
