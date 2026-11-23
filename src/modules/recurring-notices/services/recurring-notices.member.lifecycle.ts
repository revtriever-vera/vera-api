import { Injectable } from '@nestjs/common';
import { MemberDeparturePort } from '../../identity/services/member-departure.port';
import { RecurringNoticePrefDomain } from '../domain/recurring-notice-pref.domain';

@Injectable()
export class RecurringNoticesMemberLifecycle extends MemberDeparturePort {
    public readonly area: string = 'recurring-notices';

    public constructor(private readonly prefs: RecurringNoticePrefDomain) {
        super();
    }

    public async onMemberRemoved(userId: string): Promise<void> {
        await this.prefs.removeOfUser(userId);
    }
}
