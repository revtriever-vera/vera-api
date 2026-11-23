import { Injectable } from '@nestjs/common';
import { PlatformDisabledError } from '../domain/identity.errors';
import { PLATFORM_AUDIT_ACTIONS, SocialIdentity, User } from '../domain/identity.types';
import { PlatformAuditDomain } from '../domain/platform-audit.domain';
import { PlatformAvailabilityService } from './platform-availability.service';

@Injectable()
export class PlatformLoginAuditService {
    public constructor(
        private readonly audit: PlatformAuditDomain,
        private readonly availability: PlatformAvailabilityService
    ) {}

    public assertEnabled(): void {
        if (!this.availability.enabled()) {
            throw new PlatformDisabledError();
        }
    }

    public async denied(identity: SocialIdentity, ip: string | undefined): Promise<void> {
        await this.audit.record({
            operatorUserId: null,
            action: PLATFORM_AUDIT_ACTIONS.denied,
            targetCompanyId: null,
            meta: { reason: identity.emailVerified ? 'not_platform_user' : 'email_unverified', ip: ip ?? null }
        });
    }

    public async granted(user: User, ip: string | undefined): Promise<void> {
        await this.audit.record({
            operatorUserId: user.id,
            action: PLATFORM_AUDIT_ACTIONS.login,
            targetCompanyId: user.companyId,
            meta: { ip: ip ?? null }
        });
    }
}
