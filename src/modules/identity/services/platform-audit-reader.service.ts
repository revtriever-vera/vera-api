import { Injectable } from '@nestjs/common';
import { PlatformAuditDomain } from '../domain/platform-audit.domain';
import { PlatformAuditEntry } from '../domain/identity.types';

export interface PlatformAuditItem {
    readonly id: string;
    readonly action: string;
    readonly operatorUserId: string | null;
    readonly targetCompanyId: string | null;
    readonly meta: Readonly<Record<string, unknown>>;
    readonly createdAt: Date;
}

@Injectable()
export class PlatformAuditReaderService {
    public constructor(private readonly audit: PlatformAuditDomain) {}

    public async recent(limit: number): Promise<PlatformAuditItem[]> {
        const entries: PlatformAuditEntry[] = await this.audit.listRecent(limit);
        return entries.map((entry: PlatformAuditEntry): PlatformAuditItem => ({
            id: entry.id,
            action: entry.action,
            operatorUserId: entry.operatorUserId,
            targetCompanyId: entry.targetCompanyId,
            meta: entry.meta as Record<string, unknown>,
            createdAt: entry.createdAt
        }));
    }
}
