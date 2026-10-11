import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { NewSession, Session } from '../domain/identity.types';

const ACTIVE_SESSIONS_LIMIT: number = 100;

type CreateSessionData = Pick<NewSession, 'userId' | 'familyId' | 'tokenHash' | 'provider' | 'expiresAt'> &
    Partial<Pick<NewSession, 'ip' | 'userAgent'>>;

@Injectable()
export class SessionsRepository extends TenantRepository<'Sessions'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'Sessions');
    }

    public async create(data: CreateSessionData): Promise<Session> {
        return this.createRow({ id: IdUtil.newId(), companyId: this.companyId, ...data });
    }

    public async findByTokenHashAcrossTenants(tokenHash: string): Promise<Session | null> {
        return this.findOneSkipConstraint({ tokenHash });
    }

    public async rotate(oldSessionId: string, replacedById: string): Promise<boolean> {
        const rows: Session[] = await this.updateManyRows(
            { id: oldSessionId, replacedById: null },
            { replacedById, revokedAt: new Date() }
        );
        return rows.length > 0;
    }

    public async revoke(sessionId: string): Promise<void> {
        await this.updateManyRows({ id: sessionId, revokedAt: null }, { revokedAt: new Date() });
    }

    public async revokeFamily(familyId: string): Promise<number> {
        const rows: Session[] = await this.updateManyRows({ familyId, revokedAt: null }, { revokedAt: new Date() });
        return rows.length;
    }

    public async findActive(userId: string, now: Date): Promise<Session[]> {
        return this.findMany(
            { userId, revokedAt: null, expiresAt: { '>': now } },
            { orderBy: [{ property: 'createdAt', direction: 'asc' }], limit: ACTIVE_SESSIONS_LIMIT }
        );
    }
}
