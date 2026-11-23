import { Injectable } from '@nestjs/common';
import { MemberDeparturePort } from '../../identity/services/member-departure.port';
import { CANCEL_REASONS } from '../domain/reminders.types';
import { ReminderEngineService } from './reminder-engine.service';

@Injectable()
export class RemindersMemberLifecycle extends MemberDeparturePort {
    public readonly area: string = 'reminders';

    public constructor(private readonly engine: ReminderEngineService) {
        super();
    }

    public async onMemberRemoved(userId: string): Promise<void> {
        await this.engine.cancel({ userId }, CANCEL_REASONS.memberRemoved);
    }
}
