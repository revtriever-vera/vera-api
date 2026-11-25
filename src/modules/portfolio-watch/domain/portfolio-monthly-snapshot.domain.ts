import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { PortfolioMonthlySnapshotsRepository } from '../repositories/portfolio-monthly-snapshots.repository';
import { monthsBefore } from './monthly-snapshot-entries';
import { MonthlySnapshotEntry, MonthlySnapshotRow, SNAPSHOT_RETENTION_MONTHS } from './portfolio-watch.types';

@Injectable()
export class PortfolioMonthlySnapshotDomain {
    public constructor(private readonly snapshots: PortfolioMonthlySnapshotsRepository) {}

    @UsingTransaction()
    public async saveMonth(month: string, entries: readonly MonthlySnapshotEntry[]): Promise<void> {
        await this.snapshots.replaceMonth(month, entries);
        await this.snapshots.pruneBefore(monthsBefore(month, SNAPSHOT_RETENTION_MONTHS));
    }

    public async listPage(offset: number, limit: number): Promise<MonthlySnapshotRow[]> {
        return this.snapshots.listPage(offset, limit);
    }

    public async eraseAll(): Promise<number> {
        return this.snapshots.eraseAll();
    }
}
