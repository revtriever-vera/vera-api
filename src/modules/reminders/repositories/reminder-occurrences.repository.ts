import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import {
    CHANNELS,
    CanceledOccurrence,
    DeliveryChannel,
    DueOccurrenceRef,
    OCCURRENCE_STATUSES,
    OccurrenceKind,
    OccurrenceStatus,
    ReminderOccurrence
} from '../domain/reminders.types';

export type OccurrencePatch = {
    readonly status: OccurrenceStatus;
    readonly channel?: DeliveryChannel;
    readonly messageId?: string;
};

@Injectable()
export class ReminderOccurrencesRepository extends BareTenantRepository<'ReminderOccurrences'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'ReminderOccurrences');
    }

    public async schedule(reminderId: string, occurrenceAt: Date, kind: OccurrenceKind): Promise<ReminderOccurrence | null> {
        const row: ReminderOccurrence | undefined = await this.insertBuilder()
            .values({
                id: IdUtil.newId(),
                companyId: this.companyId,
                reminderId,
                occurrenceAt,
                kind,
                status: OCCURRENCE_STATUSES.scheduled
            })
            .onConflict((conflict) => conflict.doNothing())
            .returningAll()
            .executeTakeFirst();
        return row ?? null;
    }

    public async claim(id: string): Promise<ReminderOccurrence | null> {
        const rows: ReminderOccurrence[] = await this.updateManyRows(
            { id, status: OCCURRENCE_STATUSES.scheduled },
            { status: OCCURRENCE_STATUSES.sending }
        );
        return rows[0] ?? null;
    }

    public async settle(id: string, from: OccurrenceStatus, patch: OccurrencePatch): Promise<ReminderOccurrence | null> {
        const rows: ReminderOccurrence[] = await this.updateManyRows({ id, status: from }, patch);
        return rows[0] ?? null;
    }

    public async cancelScheduled(reminderIds: readonly string[]): Promise<CanceledOccurrence[]> {
        if (reminderIds.length === 0) {
            return [];
        }
        const rows: ReminderOccurrence[] = await this.updateManyRows(
            { reminderId: [...reminderIds], status: OCCURRENCE_STATUSES.scheduled },
            { status: OCCURRENCE_STATUSES.canceled }
        );
        return rows.map((row: ReminderOccurrence): CanceledOccurrence => ({
            id: row.id,
            reminderId: row.reminderId,
            occurrenceAt: row.occurrenceAt
        }));
    }

    public async findOneById(id: string): Promise<ReminderOccurrence | null> {
        return this.findById(id);
    }

    public async findOfMessage(messageId: string): Promise<ReminderOccurrence | null> {
        return this.findOne({ messageId });
    }

    public async latestSent(reminderId: string): Promise<ReminderOccurrence | null> {
        const rows: ReminderOccurrence[] = await this.findMany(
            { reminderId, status: OCCURRENCE_STATUSES.sent },
            { limit: 1, orderBy: [{ property: 'occurrenceAt', direction: 'desc' }] }
        );
        return rows[0] ?? null;
    }

    public async nextScheduledAt(reminderIds: readonly string[]): Promise<Map<string, Date>> {
        if (reminderIds.length === 0) {
            return new Map<string, Date>();
        }
        const rows: { reminderId: string; occurrenceAt: Date }[] = await this.selectScoped()
            .select(['reminderId', 'occurrenceAt'])
            .where('reminderId', 'in', [...reminderIds])
            .where('status', '=', OCCURRENCE_STATUSES.scheduled)
            .orderBy('occurrenceAt', 'desc')
            .execute();
        return new Map<string, Date>(
            rows.map((row: { reminderId: string; occurrenceAt: Date }): [string, Date] => [row.reminderId, row.occurrenceAt])
        );
    }

    public async countTemplateSends(from: Date, before: Date): Promise<number> {
        const row: { total: string | number | bigint } | undefined = await this.selectScoped()
            .select((builder) => builder.fn.countAll().as('total'))
            .where('channel', '=', CHANNELS.template)
            .where('occurrenceAt', '>=', from)
            .where('occurrenceAt', '<', before)
            .where('status', 'in', [OCCURRENCE_STATUSES.sent, OCCURRENCE_STATUSES.done, OCCURRENCE_STATUSES.unreached])
            .executeTakeFirst();
        return Number(row?.total ?? 0);
    }

    public async dueAcrossTenants(before: Date, limit: number): Promise<DueOccurrenceRef[]> {
        return this.selectSkipConstraint()
            .select(['id', 'companyId', 'occurrenceAt'])
            .where('status', '=', OCCURRENCE_STATUSES.scheduled)
            .where('occurrenceAt', '<=', before)
            .orderBy('occurrenceAt', 'asc')
            .limit(limit)
            .execute();
    }
}
