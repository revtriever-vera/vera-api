import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { AccountInvite, NewAccountInvite, UserRole } from '../domain/identity.types';

const LIST_LIMIT: number = 100;

type CreateInviteData = Pick<NewAccountInvite, 'email' | 'role' | 'tokenHash' | 'invitedByUserId' | 'expiresAt' | 'lastSentAt'>;
type RenewInviteData = Pick<NewAccountInvite, 'tokenHash' | 'expiresAt' | 'lastSentAt'>;

@Injectable()
export class AccountInvitesRepository extends TenantRepository<'AccountInvites'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'AccountInvites');
    }

    public async create(data: CreateInviteData): Promise<AccountInvite> {
        return this.createRow({ id: IdUtil.newId(), companyId: this.companyId, ...data });
    }

    public async findPendingById(id: string): Promise<AccountInvite | null> {
        return this.findOne({ id, acceptedAt: null, revokedAt: null });
    }

    public async findPendingByEmail(email: string): Promise<AccountInvite | null> {
        return this.findOne({ email, acceptedAt: null, revokedAt: null });
    }

    public async listPending(): Promise<AccountInvite[]> {
        return this.findMany(
            { acceptedAt: null, revokedAt: null },
            { orderBy: [{ property: 'createdAt', direction: 'asc' }], limit: LIST_LIMIT }
        );
    }

    public async countLive(now: Date): Promise<number> {
        const rows: AccountInvite[] = await this.findMany({ acceptedAt: null, revokedAt: null, expiresAt: { '>': now } });
        return rows.length;
    }

    public async lockByTokenHashAcrossTenants(tokenHash: string): Promise<AccountInvite | null> {
        const row: AccountInvite | undefined = await this.selectSkipConstraint()
            .selectAll()
            .where('tokenHash', '=', tokenHash)
            .where('deletedAt', 'is', null)
            .forUpdate()
            .executeTakeFirst();
        return row ?? null;
    }

    public async findByTokenHashAcrossTenants(tokenHash: string): Promise<AccountInvite | null> {
        return this.findOneSkipConstraint({ tokenHash });
    }

    public async renew(id: string, data: RenewInviteData, sendCount: number, role?: UserRole): Promise<AccountInvite | null> {
        return this.updateRow(id, { ...data, sendCount, role });
    }

    public async markAccepted(id: string, userId: string, at: Date): Promise<AccountInvite | null> {
        return this.updateRow(id, { acceptedAt: at, acceptedUserId: userId });
    }

    public async revoke(id: string, at: Date): Promise<AccountInvite | null> {
        return this.updateRow(id, { revokedAt: at });
    }
}
