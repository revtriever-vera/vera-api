import { Injectable } from '@nestjs/common';
import { CatalogSyncRunsRepository } from '../repositories/catalog-sync-runs.repository';
import { CatalogSource, CatalogSyncRun, SyncRunOutcome } from './catalog.types';

@Injectable()
export class CatalogSyncRunDomain {
    public constructor(private readonly runs: CatalogSyncRunsRepository) {}

    public async start(source: CatalogSource, startedAt: Date): Promise<CatalogSyncRun> {
        return this.runs.start(source, startedAt);
    }

    public async finish(id: string, outcome: SyncRunOutcome): Promise<void> {
        await this.runs.finish(id, outcome);
    }

    public async lastSucceededFetched(source: CatalogSource): Promise<number | null> {
        return this.runs.lastSucceededFetched(source);
    }
}
