import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { ClassAssignmentService } from '../../allocation/services/class-assignment.service';
import { MemberDeparturePort } from '../../identity/services/member-departure.port';
import { PositionDomain } from '../domain/position.domain';
import { POSITION_SUBJECT_TYPE, Position } from '../domain/positions.types';

@Injectable()
export class PositionsHolderDepartureHandler extends MemberDeparturePort {
    public readonly area: string = 'positions-holder';

    public constructor(
        private readonly positions: PositionDomain,
        private readonly assignments: ClassAssignmentService
    ) {
        super();
    }

    @UsingTransaction()
    public async onMemberRemoved(userId: string): Promise<void> {
        const folded: Position[] = await this.positions.releaseHolder(userId);
        for (const position of folded) {
            await this.assignments.release(POSITION_SUBJECT_TYPE, position.id);
        }
    }
}
