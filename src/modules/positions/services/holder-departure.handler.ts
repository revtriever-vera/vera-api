import { Injectable } from '@nestjs/common';
import { MemberDeparturePort } from '../../identity/services/member-departure.port';
import { PositionDomain } from '../domain/position.domain';

@Injectable()
export class PositionsHolderDepartureHandler extends MemberDeparturePort {
    public readonly area: string = 'positions-holder';

    public constructor(private readonly positions: PositionDomain) {
        super();
    }

    public async onMemberRemoved(userId: string): Promise<void> {
        await this.positions.clearHolder(userId);
    }
}
