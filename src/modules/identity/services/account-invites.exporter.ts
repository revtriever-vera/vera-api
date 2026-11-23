import { Injectable } from '@nestjs/common';
import { AccountInvite } from '../domain/identity.types';
import { InviteDomain } from '../domain/invite.domain';
import { AccountDataExporterPort } from './account-data-exporter.port';

export const INVITES_EXPORT_AREA: string = 'invites';

export interface InviteExport {
    readonly email: string;
    readonly role: string;
    readonly expiresAt: string;
    readonly createdAt: string;
}

@Injectable()
export class AccountInvitesExporter extends AccountDataExporterPort {
    public readonly area: string = INVITES_EXPORT_AREA;

    public constructor(private readonly invites: InviteDomain) {
        super();
    }

    public async exportAll(): Promise<InviteExport[]> {
        const pending: AccountInvite[] = await this.invites.listPending();
        return pending.map((invite: AccountInvite): InviteExport => ({
            email: invite.email,
            role: invite.role,
            expiresAt: invite.expiresAt.toISOString(),
            createdAt: invite.createdAt.toISOString()
        }));
    }
}
