import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { AuthIdentityDomain } from '../domain/auth-identity.domain';
import { Company, MEMBER_CHANGE_KINDS, MemberChangeKind, User } from '../domain/identity.types';
import { MemberNotFoundError } from '../domain/members.errors';
import { assertKeepsOwner } from '../domain/membership-rules';
import { SessionDomain } from '../domain/session.domain';
import { UserDomain } from '../domain/user.domain';
import { MemberDepartureRegistry } from './member-departure.registry';
import { MembersLogService } from './members-log.service';
import { MembersMailerService } from './members-mailer.service';
import { MembersMetricsService } from './members-metrics.service';

@Injectable()
export class MemberExitService {
    public constructor(
        private readonly users: UserDomain,
        private readonly sessions: SessionDomain,
        private readonly identities: AuthIdentityDomain,
        private readonly departures: MemberDepartureRegistry,
        private readonly mailer: MembersMailerService,
        private readonly logs: MembersLogService,
        private readonly metrics: MembersMetricsService
    ) {}

    @UsingTransaction()
    public async erase(actorId: string, userId: string): Promise<User> {
        const members: User[] = await this.users.lockMembers();
        const target: User | undefined = members.find((member: User): boolean => member.id === userId);
        if (!target) {
            throw new MemberNotFoundError();
        }
        assertKeepsOwner(members, userId, null);
        await this.sessions.revokeAllForUser(userId);
        await this.identities.eraseForUser(userId);
        await this.users.markRemoved(userId, actorId);
        return target;
    }

    public async afterExit(departed: User, company: Company, kind: MemberChangeKind): Promise<void> {
        await this.departures.notifyRemoved(departed.id);
        if (kind === MEMBER_CHANGE_KINDS.left) {
            await this.mailer.left(departed, company);
            this.logs.left(departed.id);
        }
        if (kind === MEMBER_CHANGE_KINDS.removed) {
            await this.mailer.removed(departed, company);
            this.logs.removed(departed.id);
        }
        this.metrics.change(kind);
    }
}
