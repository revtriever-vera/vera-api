import { Injectable } from '@nestjs/common';
import { Insertable, Selectable } from 'kysely';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { CalendarOAuthStates } from '../../../core/database/generated/database.types';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';

export type CalendarOAuthState = Selectable<CalendarOAuthStates>;
export type NewOAuthStateRow = Omit<Insertable<CalendarOAuthStates>, 'companyId'>;

@Injectable()
export class CalendarOAuthStatesRepository extends BareTenantRepository<'CalendarOAuthStates'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'CalendarOAuthStates');
    }

    public async create(values: NewOAuthStateRow): Promise<CalendarOAuthState> {
        return this.createRow({ ...values, companyId: this.companyId });
    }

    public async consume(nonce: string, userId: string, now: Date): Promise<CalendarOAuthState | null> {
        const rows: CalendarOAuthState[] = await this.updateManyRows(
            { nonce, userId, usedAt: null, expiresAt: { '>': now } },
            { usedAt: now }
        );
        return rows[0] ?? null;
    }
}
