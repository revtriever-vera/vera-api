import { Injectable } from '@nestjs/common';
import { SessionsRepository } from '../repositories/sessions.repository';
import { NewSession, Session } from './identity.types';
import { SessionValidation } from './validations/session.validation';

type IssueSessionData = Pick<NewSession, 'userId' | 'familyId' | 'tokenHash' | 'provider' | 'expiresAt' | 'ip' | 'userAgent'>;

@Injectable()
export class SessionDomain {
    public constructor(private readonly sessions: SessionsRepository) {}

    public async issue(data: IssueSessionData): Promise<Session> {
        return this.sessions.create(data);
    }

    public async findById(sessionId: string): Promise<Session | null> {
        return this.sessions.findById(sessionId);
    }

    public async findByTokenHashAcrossTenants(tokenHash: string): Promise<Session | null> {
        return this.sessions.findByTokenHashAcrossTenants(tokenHash);
    }

    public async getRefreshable(tokenHash: string): Promise<Session> {
        const session: Session | null = await this.findByTokenHashAcrossTenants(tokenHash);
        SessionValidation.assertRefreshable(session);
        return session;
    }

    public async rotate(oldSessionId: string, replacedById: string): Promise<boolean> {
        return this.sessions.rotate(oldSessionId, replacedById);
    }

    public async revoke(sessionId: string): Promise<void> {
        await this.sessions.revoke(sessionId);
    }

    public async revokeFamily(familyId: string): Promise<number> {
        return this.sessions.revokeFamily(familyId);
    }
}
