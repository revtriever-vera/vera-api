import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { CatalogSource, CatalogSyncRun, SYNC_RUN_STATUSES, SyncRunOutcome } from '../domain/catalog.types';

@Injectable()
export class CatalogSyncRunsRepository extends BareGlobalRepository<'CatalogSyncRuns'> {
    public constructor(database: DatabaseClient) {
        super(database, 'CatalogSyncRuns');
    }

    public async start(source: CatalogSource, startedAt: Date): Promise<CatalogSyncRun> {
        return this.createRow({ id: IdUtil.newId(), source, startedAt, status: SYNC_RUN_STATUSES.running });
    }

    public async finish(id: string, outcome: SyncRunOutcome): Promise<void> {
        await this.updateRow(id, {
            status: outcome.status,
            fetched: outcome.fetched,
            upserted: outcome.upserted,
            delisted: outcome.delisted,
            errorCode: outcome.errorCode,
            finishedAt: new Date()
        });
    }

    public async lastSucceededFetched(source: CatalogSource): Promise<number | null> {
        const rows: { fetched: number }[] = await this.db
            .selectFrom('CatalogSyncRuns')
            .select('fetched')
            .where('source', '=', source)
            .where('status', '=', SYNC_RUN_STATUSES.succeeded)
            .orderBy('startedAt', 'desc')
            .limit(1)
            .execute();
        return rows[0]?.fetched ?? null;
    }
}
