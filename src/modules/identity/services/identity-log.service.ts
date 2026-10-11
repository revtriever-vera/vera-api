import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { LoginProvider } from '../domain/identity.types';

const AUTH: string = 'identity-auth';
const PROVISIONING: string = 'identity-provisioning';
const ACCOUNT: string = 'identity-account';
const REFRESH_REUSE: string = 'auth-refresh-reuse';

@Injectable()
export class IdentityLogService {
    public constructor(private readonly logService: LogService) {}

    public loginSucceeded(userId: string, provider: LoginProvider): void {
        this.logService.info({ message: 'login succeeded', identifier: AUTH, meta: { userId, provider } });
    }

    public providerTokenRejected(provider: LoginProvider, reason: string): void {
        this.logService.warn({ message: 'provider token rejected', identifier: AUTH, meta: { provider, reason } });
    }

    public companyProvisioned(companyId: string, userId: string, provider: LoginProvider): void {
        this.logService.info({ message: 'company provisioned', identifier: PROVISIONING, meta: { companyId, userId, provider } });
    }

    public identityLinked(userId: string, provider: LoginProvider): void {
        this.logService.info({ message: 'identity linked to existing user', identifier: PROVISIONING, meta: { userId, provider } });
    }

    public emailNotProvided(provider: LoginProvider): void {
        this.logService.warn({ message: 'email not provided by provider', identifier: PROVISIONING, meta: { provider } });
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

    public exportRequested(areas: readonly string[]): void {
        this.logService.info({ message: 'account export requested', identifier: ACCOUNT, meta: { areas } });
    }

    public deletionStarted(): void {
        this.logService.info({ message: 'account deletion started', identifier: ACCOUNT });
    }

    public erasureAreaDone(area: string, erased: number): void {
        this.logService.info({ message: 'account erasure area done', identifier: ACCOUNT, meta: { area, erased } });
    }

    public erasureAreaFailed(area: string, error: unknown): void {
        this.logService.error({
            message: 'account erasure area failed',
            identifier: ACCOUNT,
            meta: { area, errorName: error instanceof Error ? error.name : typeof error }
        });
    }

    public accountDeleted(areas: readonly string[]): void {
        this.logService.info({ message: 'account deleted', identifier: ACCOUNT, meta: { areas } });
    }
}
