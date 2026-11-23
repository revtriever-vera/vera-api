import { Injectable } from '@nestjs/common';
import { IdUtil } from '../../../shared/utils/id.util';
import { CalendarEventsCreatedRepository } from '../repositories/calendar-events-created.repository';

@Injectable()
export class CalendarEventCreatedDomain {
    public constructor(private readonly created: CalendarEventsCreatedRepository) {}

    public async record(userId: string, proposalId: string, googleEventId: string): Promise<boolean> {
        return this.created.record({ id: IdUtil.newId(), userId, proposalId, googleEventId });
    }
}
