import { Injectable } from '@nestjs/common';
import { MemberDeparturePort } from '../../identity/services/member-departure.port';
import { FixedIncomeTitleDomain } from '../domain/fixed-income-title.domain';

@Injectable()
export class FixedIncomeHolderDepartureHandler extends MemberDeparturePort {
    public readonly area: string = 'fixed-income-holder';

    public constructor(private readonly titles: FixedIncomeTitleDomain) {
        super();
    }

    public async onMemberRemoved(userId: string): Promise<void> {
        await this.titles.clearHolder(userId);
    }
}
