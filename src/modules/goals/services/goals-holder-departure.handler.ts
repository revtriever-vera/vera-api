import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { MemberDeparturePort } from '../../identity/services/member-departure.port';
import { GoalDomain } from '../domain/goal.domain';

@Injectable()
export class GoalsHolderDepartureHandler extends MemberDeparturePort {
    public readonly area: string = 'goals-holder';

    public constructor(private readonly goals: GoalDomain) {
        super();
    }

    @UsingTransaction()
    public async onMemberRemoved(userId: string): Promise<void> {
        await this.goals.releaseHolder(userId);
    }
}
