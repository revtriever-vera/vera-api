import { Injectable } from '@nestjs/common';
import { MemberDeparturePort } from '../../identity/services/member-departure.port';
import { NoticePreferenceDomain } from '../domain/notice-preference.domain';
import { NoticeSendDomain } from '../domain/notice-send.domain';

@Injectable()
export class NoticesMemberLifecycle extends MemberDeparturePort {
    public readonly area: string = 'notices';

    public constructor(
        private readonly preferences: NoticePreferenceDomain,
        private readonly sends: NoticeSendDomain
    ) {
        super();
    }

    public async onMemberRemoved(userId: string): Promise<void> {
        await this.preferences.removeOfUser(userId);
        await this.sends.removeOfUser(userId);
    }
}
