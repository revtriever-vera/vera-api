import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { membersConfig } from '../config/members.config';
import { CompanyDomain } from '../domain/company.domain';
import { firstNameOf } from '../domain/first-name.util';
import { AccountClosedError } from '../domain/identity.errors';
import { AccountInvite, Company, INVITE_OUTCOMES, User, UserRole } from '../domain/identity.types';
import { InviteDomain, IssuedInvite } from '../domain/invite.domain';
import { isInviteUsable, maskEmail, normalizeEmail } from '../domain/invite-rules';
import {
    AlreadyMemberError,
    InviteInvalidError,
    InviteNotFoundError,
    MembersLimitReachedError,
    PlatformInviteRefusedError
} from '../domain/members.errors';
import { UserDomain } from '../domain/user.domain';
import { CurrentUserService } from '../services/current-user.service';
import { MembersLogService } from '../services/members-log.service';
import { MembersMailerService } from '../services/members-mailer.service';
import { MembersMetricsService } from '../services/members-metrics.service';
import { InviteResult, PublicInvite } from '../validation/members.schemas';

interface Persisted {
    readonly issued: IssuedInvite;
    readonly resent: boolean;
}

@Injectable()
export class InvitesApplication {
    public constructor(
        private readonly currentUser: CurrentUserService,
        private readonly companies: CompanyDomain,
        private readonly users: UserDomain,
        private readonly invites: InviteDomain,
        private readonly mailer: MembersMailerService,
        private readonly logs: MembersLogService,
        private readonly metrics: MembersMetricsService,
        @Inject(membersConfig.KEY) private readonly config: ConfigType<typeof membersConfig>
    ) {}

    public async create(email: string, role: UserRole): Promise<InviteResult> {
        const inviter: User = await this.currentUser.require();
        const company: Company = await this.requireInvitingCompany(inviter.companyId);
        const persisted: Persisted = await this.persist(inviter, email, role);
        await this.deliver(persisted.issued, inviter, company);
        this.logPersisted(persisted, role);
        return this.resultOf(persisted.issued.invite);
    }

    public async resend(inviteId: string): Promise<InviteResult> {
        const inviter: User = await this.currentUser.require();
        const company: Company = await this.requireInvitingCompany(inviter.companyId);
        const issued: IssuedInvite = await this.renewPending(inviteId);
        await this.deliver(issued, inviter, company);
        this.logs.resent(issued.invite.id, issued.invite.role);
        return this.resultOf(issued.invite);
    }

    public async revoke(inviteId: string): Promise<void> {
        await this.currentUser.require();
        const invite: AccountInvite | null = await this.invites.findPendingById(inviteId);
        if (!invite) {
            throw new InviteNotFoundError();
        }
        await this.invites.revoke(invite.id);
        this.metrics.invite(INVITE_OUTCOMES.revoked);
        this.logs.revoked(invite.id, invite.role);
    }

    public async lookup(token: string): Promise<PublicInvite> {
        const invite: AccountInvite | null = await this.invites.findByRawToken(token);
        if (!invite || !isInviteUsable(invite, new Date())) {
            throw new InviteInvalidError();
        }
        const company: Company | null = await this.companies.findById(invite.companyId);
        if (!company) {
            throw new InviteInvalidError();
        }
        return {
            inviterName: await this.inviterNameOf(invite),
            accountName: company.name,
            role: invite.role as UserRole,
            emailMasked: maskEmail(invite.email),
            expiresAt: invite.expiresAt.toISOString()
        };
    }

    @UsingTransaction()
    private async persist(inviter: User, email: string, role: UserRole): Promise<Persisted> {
        await this.companies.lock(inviter.companyId);
        const normalized: string = normalizeEmail(email);
        if (await this.users.findByEmail(normalized)) {
            throw new AlreadyMemberError();
        }
        const pending: AccountInvite | null = await this.invites.findPendingByEmail(normalized);
        if (pending) {
            return { issued: await this.renewOrFail(pending, role), resent: true };
        }
        await this.assertRoom();
        const issued: IssuedInvite = await this.invites.issue({
            email: normalized,
            role,
            invitedByUserId: inviter.id,
            ttlDays: this.config.INVITE_TTL_DAYS
        });
        return { issued, resent: false };
    }

    @UsingTransaction()
    private async renewPending(inviteId: string): Promise<IssuedInvite> {
        const invite: AccountInvite | null = await this.invites.findPendingById(inviteId);
        if (!invite) {
            throw new InviteNotFoundError();
        }
        return this.renewOrFail(invite);
    }

    private async renewOrFail(invite: AccountInvite, role?: UserRole): Promise<IssuedInvite> {
        const renewed: IssuedInvite | null = await this.invites.renew(invite, this.config.INVITE_TTL_DAYS, role);
        if (!renewed) {
            throw new InviteNotFoundError();
        }
        return renewed;
    }

    private async assertRoom(): Promise<void> {
        const members: User[] = await this.users.listMembers();
        const live: number = await this.invites.countLive();
        if (members.length + live >= this.config.MEMBERS_MAX_PER_ACCOUNT) {
            throw new MembersLimitReachedError(this.config.MEMBERS_MAX_PER_ACCOUNT);
        }
    }

    private logPersisted(persisted: Persisted, role: UserRole): void {
        if (persisted.resent) {
            this.logs.resent(persisted.issued.invite.id, role);
            return;
        }
        this.logs.invited(persisted.issued.invite.id, role);
    }

    private async deliver(issued: IssuedInvite, inviter: User, company: Company): Promise<void> {
        await this.mailer.invited({ invite: issued.invite, token: issued.token, inviterName: inviter.name, company });
        this.metrics.invite(INVITE_OUTCOMES.sent);
    }

    private async requireInvitingCompany(companyId: string): Promise<Company> {
        const company: Company = await this.requireCompany(companyId);
        if (company.isPlatform) {
            throw new PlatformInviteRefusedError();
        }
        return company;
    }

    private async requireCompany(companyId: string): Promise<Company> {
        const company: Company | null = await this.companies.findById(companyId);
        if (!company) {
            throw new AccountClosedError(companyId);
        }
        return company;
    }

    @AsCompany()
    private async inviterNameInCompany(_companyId: string, userId: string): Promise<string> {
        const inviter: User | null = await this.users.findById(userId);
        return inviter ? firstNameOf(inviter.name) : '';
    }

    private async inviterNameOf(invite: AccountInvite): Promise<string> {
        return invite.invitedByUserId ? this.inviterNameInCompany(invite.companyId, invite.invitedByUserId) : '';
    }

    private resultOf(invite: AccountInvite): InviteResult {
        return {
            invite: { id: invite.id, email: invite.email, role: invite.role as UserRole, expiresAt: invite.expiresAt.toISOString() }
        };
    }
}
