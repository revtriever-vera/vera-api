import { Injectable } from '@nestjs/common';
import { AccountInvitesRepository } from '../repositories/account-invites.repository';
import { AccountInvite, UserRole } from './identity.types';
import { hashInviteToken, inviteExpiryFrom, InviteToken, newInviteToken, normalizeEmail } from './invite-rules';

export interface IssueInviteInput {
    readonly email: string;
    readonly role: UserRole;
    readonly invitedByUserId: string;
    readonly ttlDays: number;
}

export interface IssuedInvite {
    readonly invite: AccountInvite;
    readonly token: string;
}

@Injectable()
export class InviteDomain {
    public constructor(private readonly invites: AccountInvitesRepository) {}

    public async issue(input: IssueInviteInput): Promise<IssuedInvite> {
        const now: Date = new Date();
        const token: InviteToken = newInviteToken();
        const invite: AccountInvite = await this.invites.create({
            email: normalizeEmail(input.email),
            role: input.role,
            tokenHash: token.hash,
            invitedByUserId: input.invitedByUserId,
            expiresAt: inviteExpiryFrom(now, input.ttlDays),
            lastSentAt: now
        });
        return { invite, token: token.raw };
    }

    public async renew(invite: AccountInvite, ttlDays: number, role?: UserRole): Promise<IssuedInvite | null> {
        const now: Date = new Date();
        const token: InviteToken = newInviteToken();
        const renewed: AccountInvite | null = await this.invites.renew(
            invite.id,
            { tokenHash: token.hash, expiresAt: inviteExpiryFrom(now, ttlDays), lastSentAt: now },
            invite.sendCount + 1,
            role
        );
        return renewed ? { invite: renewed, token: token.raw } : null;
    }

    public async findPendingById(id: string): Promise<AccountInvite | null> {
        return this.invites.findPendingById(id);
    }

    public async findPendingByEmail(email: string): Promise<AccountInvite | null> {
        return this.invites.findPendingByEmail(normalizeEmail(email));
    }

    public async listPending(): Promise<AccountInvite[]> {
        return this.invites.listPending();
    }

    public async countLive(): Promise<number> {
        return this.invites.countLive(new Date());
    }

    public async lockByRawToken(rawToken: string): Promise<AccountInvite | null> {
        return this.invites.lockByTokenHashAcrossTenants(hashInviteToken(rawToken));
    }

    public async findByRawToken(rawToken: string): Promise<AccountInvite | null> {
        return this.invites.findByTokenHashAcrossTenants(hashInviteToken(rawToken));
    }

    public async markAccepted(inviteId: string, userId: string): Promise<void> {
        await this.invites.markAccepted(inviteId, userId, new Date());
    }

    public async revoke(inviteId: string): Promise<void> {
        await this.invites.revoke(inviteId, new Date());
    }
}
