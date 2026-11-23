import { Injectable } from '@nestjs/common';
import { Insertable } from 'kysely';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { CalendarConnections } from '../../../core/database/generated/database.types';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { CONNECTION_STATUSES, CalendarConnection, ConnectionStatus } from '../domain/calendar.types';

export type NewConnectionRow = Omit<Insertable<CalendarConnections>, 'companyId'>;

@Injectable()
export class CalendarConnectionsRepository extends TenantRepository<'CalendarConnections'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'CalendarConnections');
    }

    public async create(values: NewConnectionRow): Promise<CalendarConnection> {
        return this.createRow({ ...values, companyId: this.companyId });
    }

    public async findActive(userId: string): Promise<CalendarConnection | null> {
        return this.findOne({ userId, status: CONNECTION_STATUSES.active });
    }

    public async findLatest(userId: string): Promise<CalendarConnection | null> {
        const rows: CalendarConnection[] = await this.findMany(
            { userId },
            {
                limit: 1,
                orderBy: [
                    { property: 'createdAt', direction: 'desc' },
                    { property: 'id', direction: 'desc' }
                ]
            }
        );
        return rows[0] ?? null;
    }

    public async listActive(userId?: string): Promise<CalendarConnection[]> {
        return this.findMany({ status: CONNECTION_STATUSES.active, userId }, { limit: 1000 });
    }

    public async close(id: string, status: ConnectionStatus, now: Date): Promise<CalendarConnection | null> {
        const rows: CalendarConnection[] = await this.updateManyRows(
            { id, status: CONNECTION_STATUSES.active },
            { status, refreshTokenSealed: null, sealerDriver: null, disconnectedAt: now, updatedAt: now }
        );
        return rows[0] ?? null;
    }

    public async listAll(offset: number, limit: number): Promise<CalendarConnection[]> {
        return this.findMany({}, { limit, offset, orderBy: [{ property: 'createdAt', direction: 'asc' }] });
    }

    public async listWithTokens(): Promise<CalendarConnection[]> {
        const rows: CalendarConnection[] = await this.findMany({ status: CONNECTION_STATUSES.active }, { limit: 10_000 });
        return rows.filter((row: CalendarConnection): boolean => row.refreshTokenSealed !== null);
    }

    public async replaceSealed(id: string, sealed: string, driver: string): Promise<void> {
        await this.updateRow(id, { refreshTokenSealed: sealed, sealerDriver: driver, updatedAt: new Date() });
    }

    public async companyIdsWithTokens(): Promise<string[]> {
        const rows: { companyId: string }[] = await this.selectSkipConstraint()
            .select('companyId')
            .distinct()
            .where('status', '=', CONNECTION_STATUSES.active)
            .where('refreshTokenSealed', 'is not', null)
            .where('deletedAt', 'is', null)
            .execute();
        return rows.map((row: { companyId: string }): string => row.companyId);
    }
}
