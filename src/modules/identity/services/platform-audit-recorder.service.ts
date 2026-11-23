import { Injectable } from '@nestjs/common';
import { PLATFORM_AUDIT_ACTIONS, PlatformAuditAction } from '../domain/identity.types';
import { PlatformAuditDomain } from '../domain/platform-audit.domain';

type AuditMeta = Readonly<Record<string, unknown>>;

@Injectable()
export class PlatformAuditRecorderService {
    public constructor(private readonly audit: PlatformAuditDomain) {}

    public async signupLinkCreated(operatorUserId: string | null, meta: AuditMeta): Promise<void> {
        await this.record(operatorUserId, PLATFORM_AUDIT_ACTIONS.signupLinkCreated, meta);
    }

    public async signupLinkRevoked(operatorUserId: string | null, meta: AuditMeta): Promise<void> {
        await this.record(operatorUserId, PLATFORM_AUDIT_ACTIONS.signupLinkRevoked, meta);
    }

    private async record(operatorUserId: string | null, action: PlatformAuditAction, meta: AuditMeta): Promise<void> {
        await this.audit.record({ operatorUserId, action, targetCompanyId: null, meta });
    }
}
