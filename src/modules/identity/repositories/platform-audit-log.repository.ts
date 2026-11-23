import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { NewPlatformAuditEntry, PlatformAuditEntry } from '../domain/identity.types';

type RecordEntryData = Pick<NewPlatformAuditEntry, 'operatorUserId' | 'action' | 'targetCompanyId' | 'meta'>;

@Injectable()
export class PlatformAuditLogRepository extends BareGlobalRepository<'PlatformAuditLog'> {
    public constructor(database: DatabaseClient) {
        super(database, 'PlatformAuditLog');
    }

    public async record(data: RecordEntryData): Promise<PlatformAuditEntry> {
        return this.createRow({ id: IdUtil.newId(), ...data });
    }

    public async listRecent(limit: number): Promise<PlatformAuditEntry[]> {
        return this.findMany({}, { orderBy: [{ property: 'createdAt', direction: 'desc' }], limit });
    }

    public async listOfTarget(targetCompanyId: string, action: string, limit: number): Promise<PlatformAuditEntry[]> {
        return this.findMany({ targetCompanyId, action }, { orderBy: [{ property: 'createdAt', direction: 'desc' }], limit });
    }
}
