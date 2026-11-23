import { Injectable } from '@nestjs/common';
import { Selectable } from 'kysely';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { CalendarEventsCreated } from '../../../core/database/generated/database.types';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';

export type CalendarEventCreated = Selectable<CalendarEventsCreated>;

export interface NewEventCreated {
    readonly id: string;
    readonly userId: string;
    readonly proposalId: string;
    readonly googleEventId: string;
}

@Injectable()
export class CalendarEventsCreatedRepository extends BareTenantRepository<'CalendarEventsCreated'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'CalendarEventsCreated');
    }

    public async record(values: NewEventCreated): Promise<boolean> {
        const inserted: { id: string } | undefined = await this.insertBuilder()
            .values({ ...values, companyId: this.companyId })
            .onConflict((conflict) => conflict.columns(['companyId', 'proposalId']).doNothing())
            .returning('id')
            .executeTakeFirst();
        return inserted !== undefined;
    }

    public async findOfProposal(proposalId: string): Promise<CalendarEventCreated | null> {
        return this.findOne({ proposalId });
    }
}
