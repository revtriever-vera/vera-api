import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { FundCoverageRow, FundCoverageWrite } from '../domain/market-data.types';

const IDLE_BATCH: number = 500;

@Injectable()
export class FundQuoteCoverageRepository extends BareGlobalRepository<'FundQuoteCoverage'> {
    public constructor(database: DatabaseClient) {
        super(database, 'FundQuoteCoverage');
    }

    public async findByAsset(assetId: string): Promise<FundCoverageRow | null> {
        return this.findOne({ assetId });
    }

    public async save(assetId: string, coveredFrom: string, coveredTo: string, at: Date): Promise<void> {
        const patch: Required<FundCoverageWrite> = { coveredFrom, coveredTo, readAt: at, updatedAt: at };
        await this.upsertRow({ id: IdUtil.newId(), assetId, ...patch }, { columns: ['assetId'], update: patch });
    }

    public async touch(assetId: string, at: Date): Promise<void> {
        await this.updateManyRows({ assetId }, { readAt: at });
    }

    public async trimBefore(cutoff: Date, at: Date): Promise<void> {
        await this.updateManyRows({ coveredFrom: { '<': cutoff } }, { coveredFrom: cutoff, updatedAt: at });
    }

    public async removeIdle(readBefore: Date): Promise<string[]> {
        const rows: FundCoverageRow[] = await this.findMany({ readAt: { '<': readBefore } }, { limit: IDLE_BATCH });
        if (rows.length === 0) {
            return [];
        }
        await this.hardDeleteWhere({ id: rows.map((row: FundCoverageRow): string => row.id) }, IDLE_BATCH);
        return rows.map((row: FundCoverageRow): string => row.assetId);
    }
}
