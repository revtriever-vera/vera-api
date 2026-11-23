import { Injectable } from '@nestjs/common';
import { MemberDeparturePort } from '../../identity/services/member-departure.port';
import { CalendarClientService } from './calendar-client.service';

@Injectable()
export class CalendarMemberLifecycle extends MemberDeparturePort {
    public readonly area: string = 'calendar';

    public constructor(private readonly client: CalendarClientService) {
        super();
    }

    public async onMemberRemoved(userId: string): Promise<void> {
        await this.client.disconnectAll(userId);
    }
}
