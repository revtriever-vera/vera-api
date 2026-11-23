import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { EVENT_STATUSES, EventRowStatus, RevtrieverEvent } from '../domain/billing.types';

export interface NewEvent {
    readonly externalEventId: string;
    readonly type: string;
    readonly payload: unknown;
}

const RECENT_EVENTS_LIMIT: number = 200;

@Injectable()
export class RevtrieverEventsRepository extends BareGlobalRepository<'RevtrieverEvents'> {
    public constructor(database: DatabaseClient) {
        super(database, 'RevtrieverEvents');
    }

    public async insertOnce(event: NewEvent): Promise<RevtrieverEvent | null> {
        const row: RevtrieverEvent | undefined = await this.insertBuilder()
            .values({
                id: IdUtil.newId(),
                externalEventId: event.externalEventId,
                type: event.type,
                status: EVENT_STATUSES.received,
                payload: JSON.stringify(event.payload)
            })
            .onConflict((conflict) => conflict.column('externalEventId').doNothing())
            .returningAll()
            .executeTakeFirst();
        return row ?? null;
    }

    public async finish(id: string, status: EventRowStatus, error: string | null): Promise<void> {
        await this.updateManyRows({ id, status: EVENT_STATUSES.received }, { status, error, processedAt: new Date() });
    }

    public async listStalledReceived(before: Date, limit: number): Promise<RevtrieverEvent[]> {
        return this.findMany(
            { status: EVENT_STATUSES.received, receivedAt: { '<': before } },
            { limit, orderBy: [{ property: 'receivedAt', direction: 'asc' }] }
        );
    }

    public async listOfTypeSince(type: string, since: Date): Promise<RevtrieverEvent[]> {
        return this.findMany(
            { type, receivedAt: { '>=': since } },
            { limit: RECENT_EVENTS_LIMIT, orderBy: [{ property: 'receivedAt', direction: 'desc' }] }
        );
    }
}
