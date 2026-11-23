import { Injectable } from '@nestjs/common';
import { PlatformAuditLogRepository } from '../repositories/platform-audit-log.repository';
import { PlatformAuditAction, PlatformAuditEntry } from './identity.types';

export interface AuditRecordInput {
    readonly operatorUserId: string | null;
    readonly action: PlatformAuditAction;
    readonly targetCompanyId: string | null;
    readonly meta: Readonly<Record<string, unknown>>;
}

@Injectable()
export class PlatformAuditDomain {
    public constructor(private readonly entries: PlatformAuditLogRepository) {}

    public async record(input: AuditRecordInput): Promise<PlatformAuditEntry> {
        return this.entries.record({ ...input, meta: JSON.stringify(input.meta) });
    }

    public async listRecent(limit: number): Promise<PlatformAuditEntry[]> {
        return this.entries.listRecent(limit);
    }
}
