import { Injectable } from '@nestjs/common';
import { Insertable } from 'kysely';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { Reminders } from '../../../core/database/generated/database.types';
import { WhereFilter } from '../../../core/database/repositories/global.repository';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { CancelReason, CancelScope, REMINDER_STATUSES, Reminder } from '../domain/reminders.types';

export type NewReminderRow = Omit<Insertable<Reminders>, 'companyId'>;

@Injectable()
export class RemindersRepository extends TenantRepository<'Reminders'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'Reminders');
    }

    public async create(values: NewReminderRow): Promise<Reminder> {
        return this.createRow({ ...values, companyId: this.companyId });
    }

    public async countActive(userId: string): Promise<number> {
        const row: { total: string | number | bigint } | undefined = await this.selectScoped()
            .select((builder) => builder.fn.countAll().as('total'))
            .where('userId', '=', userId)
            .where('status', '=', REMINDER_STATUSES.active)
            .executeTakeFirst();
        return Number(row?.total ?? 0);
    }

    public async listActive(userId: string): Promise<Reminder[]> {
        return this.findMany(
            { userId, status: REMINDER_STATUSES.active },
            {
                limit: 200,
                orderBy: [
                    { property: 'createdAt', direction: 'asc' },
                    { property: 'id', direction: 'asc' }
                ]
            }
        );
    }

    public async findActiveOfUser(id: string, userId: string): Promise<Reminder | null> {
        return this.findOne({ id, userId, status: REMINDER_STATUSES.active });
    }

    public async listAll(offset: number, limit: number): Promise<Reminder[]> {
        return this.findMany({}, { limit, offset, orderBy: [{ property: 'createdAt', direction: 'asc' }] });
    }

    public async finish(id: string): Promise<boolean> {
        const rows: Reminder[] = await this.updateManyRows({ id, status: REMINDER_STATUSES.active }, { status: REMINDER_STATUSES.done });
        return rows.length > 0;
    }

    public async cancel(scope: CancelScope | { readonly id: string }, reason: CancelReason): Promise<Reminder[]> {
        return this.updateManyRows(
            { ...this.filterOf(scope), status: REMINDER_STATUSES.active },
            { status: REMINDER_STATUSES.canceled, canceledReason: reason }
        );
    }

    public async countActiveAcrossTenants(): Promise<number> {
        const row: { total: string | number | bigint } | undefined = await this.selectSkipConstraint()
            .select((builder) => builder.fn.countAll().as('total'))
            .where('status', '=', REMINDER_STATUSES.active)
            .where('deletedAt', 'is', null)
            .executeTakeFirst();
        return Number(row?.total ?? 0);
    }

    private filterOf(scope: CancelScope | { readonly id: string }): WhereFilter<'Reminders'> {
        if ('id' in scope) {
            return { id: scope.id };
        }
        if ('linkId' in scope) {
            return { linkId: scope.linkId };
        }
        return 'userId' in scope ? { userId: scope.userId } : {};
    }
}
