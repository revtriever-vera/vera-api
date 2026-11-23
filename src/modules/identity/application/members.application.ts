import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { CompanyDomain } from '../domain/company.domain';
import { AccountClosedError } from '../domain/identity.errors';
import { AccountInvite, Company, MEMBER_CHANGE_KINDS, MemberChangeKind, USER_ROLES, User, UserRole } from '../domain/identity.types';
import { InviteDomain } from '../domain/invite.domain';
import { CannotRemoveSelfError, MemberNotFoundError } from '../domain/members.errors';
import { assertKeepsOwner } from '../domain/membership-rules';
import { UserDomain } from '../domain/user.domain';
import { CurrentUserService } from '../services/current-user.service';
import { MemberExitService } from '../services/member-exit.service';
import { MembersLogService } from '../services/members-log.service';
import { MembersMetricsService } from '../services/members-metrics.service';
import { MemberResult, MemberView, MembersList } from '../validation/members.schemas';

interface RoleChange {
    readonly user: User;
    readonly from: string;
}

@Injectable()
export class MembersApplication {
    public constructor(
        private readonly currentUser: CurrentUserService,
        private readonly companies: CompanyDomain,
        private readonly users: UserDomain,
        private readonly invites: InviteDomain,
        private readonly exit: MemberExitService,
        private readonly logs: MembersLogService,
        private readonly metrics: MembersMetricsService
    ) {}

    public async list(): Promise<MembersList> {
        const me: User = await this.currentUser.require();
        const seesEmails: boolean = me.role === USER_ROLES.owner;
        const members: User[] = await this.users.listMembers();
        const pending: AccountInvite[] = seesEmails ? await this.invites.listPending() : [];
        return {
            members: members.map((member: User): MemberView => this.viewOf(member, me, seesEmails)),
            invites: pending.map((invite: AccountInvite) => ({
                id: invite.id,
                email: invite.email,
                role: invite.role as UserRole,
                expiresAt: invite.expiresAt.toISOString(),
                lastSentAt: invite.lastSentAt.toISOString()
            }))
        };
    }

    public async changeRole(userId: string, role: UserRole): Promise<MemberResult> {
        const me: User = await this.currentUser.require();
        const change: RoleChange = await this.applyRole(userId, role);
        if (change.from !== role) {
            this.metrics.change(MEMBER_CHANGE_KINDS.roleChanged);
            this.logs.roleChanged(userId, change.from, role);
        }
        return { member: this.viewOf(change.user, me, true) };
    }

    public async remove(userId: string): Promise<void> {
        const me: User = await this.currentUser.require();
        if (me.id === userId) {
            throw new CannotRemoveSelfError();
        }
        await this.depart(me, userId, MEMBER_CHANGE_KINDS.removed);
    }

    public async leave(): Promise<void> {
        const me: User = await this.currentUser.require();
        await this.depart(me, me.id, MEMBER_CHANGE_KINDS.left);
    }

    @UsingTransaction()
    private async applyRole(userId: string, role: UserRole): Promise<RoleChange> {
        const members: User[] = await this.users.lockMembers();
        const target: User | undefined = members.find((member: User): boolean => member.id === userId);
        if (!target) {
            throw new MemberNotFoundError();
        }
        if (target.role === role) {
            return { user: target, from: target.role };
        }
        assertKeepsOwner(members, userId, role);
        const updated: User | null = await this.users.changeRole(userId, role);
        return { user: updated ?? target, from: target.role };
    }

    private async depart(actor: User, userId: string, kind: MemberChangeKind): Promise<void> {
        const company: Company | null = await this.companies.findById(actor.companyId);
        if (!company) {
            throw new AccountClosedError(actor.companyId);
        }
        const departed: User = await this.exit.erase(actor.id, userId);
        await this.exit.afterExit(departed, company, kind);
    }

    private viewOf(member: User, me: User, seesEmails: boolean): MemberView {
        return {
            userId: member.id,
            name: member.name,
            email: seesEmails || member.id === me.id ? member.email : null,
            role: member.role as UserRole,
            isYou: member.id === me.id,
            joinedAt: member.createdAt.toISOString()
        };
    }
}
