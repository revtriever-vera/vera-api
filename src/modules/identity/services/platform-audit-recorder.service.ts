import { Injectable } from '@nestjs/common';
import { PLATFORM_AUDIT_ACTIONS, PlatformAuditAction, User } from '../domain/identity.types';
import { PlatformAuditDomain } from '../domain/platform-audit.domain';

type AuditMeta = Readonly<Record<string, unknown>>;

@Injectable()
export class PlatformAuditRecorderService {
    public constructor(private readonly audit: PlatformAuditDomain) {}

    public async signupLinkCreated(operatorUserId: string | null, meta: AuditMeta): Promise<void> {
        await this.record(operatorUserId, PLATFORM_AUDIT_ACTIONS.signupLinkCreated, meta);
    }

    public async signupLinkUpdated(operatorUserId: string | null, meta: AuditMeta): Promise<void> {
        await this.record(operatorUserId, PLATFORM_AUDIT_ACTIONS.signupLinkUpdated, meta);
    }

    public async signupLinkRevoked(operatorUserId: string | null, meta: AuditMeta): Promise<void> {
        await this.record(operatorUserId, PLATFORM_AUDIT_ACTIONS.signupLinkRevoked, meta);
    }

    public async accountViewed(operatorUserId: string | null, targetCompanyId: string, meta: AuditMeta): Promise<void> {
        await this.audit.record({ operatorUserId, action: PLATFORM_AUDIT_ACTIONS.accountViewed, targetCompanyId, meta });
    }

    public async platformTokenCreated(operatorUserId: string | null, meta: AuditMeta): Promise<void> {
        await this.record(operatorUserId, PLATFORM_AUDIT_ACTIONS.platformTokenCreated, meta);
    }

    public async platformTokenRevoked(operatorUserId: string | null, meta: AuditMeta): Promise<void> {
        await this.record(operatorUserId, PLATFORM_AUDIT_ACTIONS.platformTokenRevoked, meta);
    }

    public async mcpToolCalled(operatorUserId: string | null, meta: AuditMeta): Promise<void> {
        await this.record(operatorUserId, PLATFORM_AUDIT_ACTIONS.mcpToolCalled, meta);
    }

    public async totpEnrolled(user: User, ip: string | undefined): Promise<void> {
        await this.recordFor(user, PLATFORM_AUDIT_ACTIONS.totpEnrolled, { ip: ip ?? null });
    }

    public async recoveryCodeUsed(user: User, ip: string | undefined): Promise<void> {
        await this.recordFor(user, PLATFORM_AUDIT_ACTIONS.recoveryCodeUsed, { ip: ip ?? null });
    }

    public async totpLocked(user: User, ip: string | undefined): Promise<void> {
        await this.recordFor(user, PLATFORM_AUDIT_ACTIONS.totpLocked, { ip: ip ?? null });
    }

    public async adminCreated(user: User): Promise<void> {
        await this.recordFor(user, PLATFORM_AUDIT_ACTIONS.created, { via: 'seed' });
    }

    public async totpReset(user: User): Promise<void> {
        await this.recordFor(user, PLATFORM_AUDIT_ACTIONS.totpReset, { via: 'seed' });
    }

    private async recordFor(user: User, action: PlatformAuditAction, meta: AuditMeta): Promise<void> {
        await this.audit.record({ operatorUserId: user.id, action, targetCompanyId: user.companyId, meta });
    }

    private async record(operatorUserId: string | null, action: PlatformAuditAction, meta: AuditMeta): Promise<void> {
        await this.audit.record({ operatorUserId, action, targetCompanyId: null, meta });
    }
}
