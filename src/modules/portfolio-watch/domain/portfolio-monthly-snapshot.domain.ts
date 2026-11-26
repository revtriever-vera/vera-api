import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
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

    public async entriesOf(month: string): Promise<MonthlySnapshotEntry[]> {
        const rows: MonthlySnapshotRow[] = await this.snapshots.listByMonth(month);
        return rows.map((row: MonthlySnapshotRow): MonthlySnapshotEntry => ({
            assetId: row.assetId,
            holdingKind: row.holdingKind,
            classId: row.classId,
            quantity: row.quantity,
            price: row.price,
            priceDate: row.priceDate === null ? null : DateUtil.onlyLocalDateString(new Date(row.priceDate)),
            valueMinor: Number(row.valueMinor),
            currency: row.currency
        }));
    }

    public async listPage(offset: number, limit: number): Promise<MonthlySnapshotRow[]> {
        return this.snapshots.listPage(offset, limit);
    }

    public async eraseAll(): Promise<number> {
        return this.snapshots.eraseAll();
    }
}
