import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { AuthIdentityDomain } from '../domain/auth-identity.domain';
import {
    AccountInvite,
    AuthIdentity,
    INVITE_OUTCOMES,
    LOGIN_OUTCOMES,
    LoginOutcome,
    SocialIdentity,
    User,
    UserRole
} from '../domain/identity.types';
import { InviteDomain } from '../domain/invite.domain';
import { isInviteExpired, normalizeEmail } from '../domain/invite-rules';
import { AccountNotEmptyError, InviteEmailMismatchError, InviteInvalidError } from '../domain/members.errors';
import { nameFromEmail } from '../domain/name-from-email.util';
import { UserDomain } from '../domain/user.domain';
import { AccountEmptinessService } from './account-emptiness.service';
import { MembersLogService } from './members-log.service';
import { MembersMetricsService } from './members-metrics.service';

export interface InviteAcceptance {
    readonly user: User;
    readonly outcome: LoginOutcome;
}

@Injectable()
export class InviteAcceptanceService {
    public constructor(
        private readonly users: UserDomain,
        private readonly identities: AuthIdentityDomain,
        private readonly invites: InviteDomain,
        private readonly emptiness: AccountEmptinessService,
        private readonly logs: MembersLogService,
        private readonly metrics: MembersMetricsService
    ) {}

    @UsingTransaction()
    public async accept(identity: SocialIdentity, token: string): Promise<InviteAcceptance> {
        const invite: AccountInvite | null = await this.invites.lockByRawToken(token);
        if (!invite) {
            throw new InviteInvalidError();
        }
        if (invite.acceptedAt !== null) {
            return this.replayAccepted(invite, identity);
        }
        this.assertUsable(invite);
        this.assertSameEmail(invite, identity);
        const known: AuthIdentity | null = await this.identities.findByProviderSubjectAcrossTenants(identity.provider, identity.subject);
        const existing: User | null = await this.existingOf(known, invite.email);
        if (existing?.companyId === invite.companyId) {
            return this.acceptAsMember(invite, existing, known === null ? identity : null);
        }
        if (existing) {
            await this.releaseEmptyAccount(invite, existing);
        }
        return { user: await this.joinCompany(invite.companyId, identity, invite), outcome: LOGIN_OUTCOMES.joined };
    }

    private async replayAccepted(invite: AccountInvite, identity: SocialIdentity): Promise<InviteAcceptance> {
        const known: AuthIdentity | null = await this.identities.findByProviderSubjectAcrossTenants(identity.provider, identity.subject);
        if (known?.userId !== invite.acceptedUserId) {
            throw new InviteInvalidError();
        }
        const user: User | null = await this.loadUser(known.companyId, known.userId);
        if (!user) {
            throw new InviteInvalidError();
        }
        return { user, outcome: LOGIN_OUTCOMES.joined };
    }

    private assertUsable(invite: AccountInvite): void {
        if (invite.revokedAt !== null) {
            this.metrics.invite(INVITE_OUTCOMES.revoked);
            throw new InviteInvalidError();
        }
        if (isInviteExpired(invite, new Date())) {
            this.metrics.invite(INVITE_OUTCOMES.expired);
            throw new InviteInvalidError();
        }
    }

    private assertSameEmail(invite: AccountInvite, identity: SocialIdentity): void {
        const matches: boolean = identity.emailVerified && identity.email !== null && normalizeEmail(identity.email) === invite.email;
        if (!matches) {
            this.logs.emailMismatch(invite.id);
            this.metrics.invite(INVITE_OUTCOMES.mismatch);
            throw new InviteEmailMismatchError();
        }
    }

    private async existingOf(known: AuthIdentity | null, email: string): Promise<User | null> {
        if (known) {
            return this.loadUser(known.companyId, known.userId);
        }
        return this.users.findByEmailAcrossTenants(email);
    }

    private async acceptAsMember(invite: AccountInvite, existing: User, toLink: SocialIdentity | null): Promise<InviteAcceptance> {
        await this.markAcceptedInCompany(invite.companyId, invite, existing, toLink);
        return { user: existing, outcome: LOGIN_OUTCOMES.joined };
    }

    private async releaseEmptyAccount(invite: AccountInvite, existing: User): Promise<void> {
        if (!(await this.emptiness.eraseIfEmpty(existing.companyId))) {
            this.logs.accountNotEmpty(invite.id);
            this.metrics.invite(INVITE_OUTCOMES.notEmpty);
            throw new AccountNotEmptyError();
        }
    }

    @AsCompany()
    private async loadUser(_companyId: string, userId: string): Promise<User | null> {
        return this.users.findById(userId);
    }

    @AsCompany()
    private async markAcceptedInCompany(
        _companyId: string,
        invite: AccountInvite,
        user: User,
        toLink: SocialIdentity | null
    ): Promise<void> {
        if (toLink) {
            await this.identities.link(user.id, toLink);
        }
        await this.invites.markAccepted(invite.id, user.id);
        this.logs.accepted(invite.id, invite.role);
        this.metrics.invite(INVITE_OUTCOMES.accepted);
    }

    @AsCompany()
    private async joinCompany(_companyId: string, identity: SocialIdentity, invite: AccountInvite): Promise<User> {
        const now: Date = new Date();
        const user: User = await this.users.createMember({
            email: invite.email,
            name: identity.name ?? nameFromEmail(invite.email),
            role: invite.role as UserRole,
            emailVerifiedAt: now,
            termsAcceptedAt: now
        });
        await this.identities.link(user.id, identity);
        await this.invites.markAccepted(invite.id, user.id);
        this.logs.accepted(invite.id, invite.role);
        this.metrics.invite(INVITE_OUTCOMES.accepted);
        return user;
    }
}
