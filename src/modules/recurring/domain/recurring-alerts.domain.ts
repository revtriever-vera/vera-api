import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { RecurringAlertsRepository } from '../repositories/recurring-alerts.repository';
import { diffAlerts } from './alert-sync';
import { AlertData, AlertKind, AlertRecord, AlertRow, DesiredAlert } from './recurring-alerts.types';
import { AlertNotFoundError } from './recurring.errors';

function toRecord(row: AlertRow): AlertRecord {
    return {
        id: row.id,
        seriesId: row.seriesId,
        kind: row.kind as AlertKind,
        fingerprint: row.fingerprint,
        occurredOn: DateUtil.onlyLocalDateString(new Date(row.occurredOn)),
        data: row.data as AlertData,
        seenAt: row.seenAt === null ? null : new Date(row.seenAt)
    };
}

@Injectable()
export class RecurringAlertsDomain {
    public constructor(private readonly alerts: RecurringAlertsRepository) {}

    public async list(): Promise<AlertRecord[]> {
        return (await this.alerts.listAll()).map(toRecord);
    }

    public async removeOfSeries(seriesIds: readonly string[]): Promise<void> {
        await this.alerts.softDeleteBySeriesIds(seriesIds);
    }

    public async sync(desired: readonly DesiredAlert[]): Promise<void> {
        const diff: ReturnType<typeof diffAlerts> = diffAlerts(await this.list(), desired);
        await this.alerts.softDeleteMany(diff.removeIds);
        for (const change of diff.update) {
            await this.alerts.refresh(change.id, change.alert);
        }
        await this.alerts.insertMany(diff.insert);
    }

    public async markSeen(id: string, now: Date): Promise<AlertRecord> {
        const row: AlertRow | null = await this.alerts.findById(id);
        if (row === null) {
            throw new AlertNotFoundError(id);
        }
        if (row.seenAt !== null) {
            return toRecord(row);
        }
        const updated: AlertRow | null = await this.alerts.markSeen(id, now);
        if (updated === null) {
            throw new AlertNotFoundError(id);
        }
        return toRecord(updated);
    }
}
