import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { ALERT_LIST_LIMIT, AlertRow, DesiredAlert } from '../domain/recurring-alerts.types';

@Injectable()
export class RecurringAlertsRepository extends TenantRepository<'RecurringAlerts'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'RecurringAlerts');
    }

    public async listAll(): Promise<AlertRow[]> {
        return this.findMany({}, { limit: ALERT_LIST_LIMIT, orderBy: [{ property: 'occurredOn', direction: 'desc' }] });
    }

    public async insertMany(alerts: readonly DesiredAlert[]): Promise<void> {
        if (alerts.length === 0) {
            return;
        }
        await this.createManyRows(
            alerts.map((alert: DesiredAlert) => ({
                id: IdUtil.newId(),
                companyId: this.companyId,
                seriesId: alert.seriesId,
                kind: alert.kind,
                fingerprint: alert.fingerprint,
                occurredOn: alert.occurredOn,
                data: JSON.stringify(alert.data)
            }))
        );
    }

    public async refresh(id: string, alert: DesiredAlert): Promise<void> {
        await this.updateRow(id, { occurredOn: alert.occurredOn, data: JSON.stringify(alert.data) });
    }

    public async markSeen(id: string, at: Date): Promise<AlertRow | null> {
        return this.updateRow(id, { seenAt: at });
    }

    public async softDeleteBySeriesIds(seriesIds: readonly string[]): Promise<void> {
        if (seriesIds.length > 0) {
            await this.updateManyRows({ seriesId: [...seriesIds] }, { deletedAt: new Date() });
        }
    }

    public async softDeleteMany(ids: readonly string[]): Promise<void> {
        if (ids.length > 0) {
            await this.updateManyRows({ id: [...ids] }, { deletedAt: new Date() });
        }
    }
}
