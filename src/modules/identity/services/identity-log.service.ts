import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { LoginProvider } from '../domain/identity.types';

const AUTH: string = 'identity-auth';
const REFRESH_REUSE: string = 'auth-refresh-reuse';

@Injectable()
export class IdentityLogService {
    public constructor(private readonly logService: LogService) {}

    public loginSucceeded(userId: string, provider: LoginProvider): void {
        this.logService.info({ message: 'login succeeded', identifier: AUTH, meta: { userId, provider } });
    }

    public refreshed(userId: string): void {
        this.logService.info({ message: 'refreshed', identifier: AUTH, meta: { userId } });
    }

    public loggedOut(userId: string): void {
        this.logService.info({ message: 'logged out', identifier: AUTH, meta: { userId } });
    }

    public refreshReuseDetected(familyId: string, revoked: number, userId: string): void {
        this.logService.warn({
            message: 'refresh token reused — session family revoked',
            identifier: REFRESH_REUSE,
            meta: { familyId, revoked, userId }
        });
    }
}
