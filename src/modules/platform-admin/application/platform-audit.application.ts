import { Injectable } from '@nestjs/common';
import { PlatformAuditItem, PlatformAuditReaderService } from '../../identity/services/platform-audit-reader.service';
import { AuditEntryView } from '../validation/platform-audit.schemas';

@Injectable()
export class PlatformAuditApplication {
    public constructor(private readonly reader: PlatformAuditReaderService) {}

    public async recent(limit: number): Promise<AuditEntryView[]> {
        const items: PlatformAuditItem[] = await this.reader.recent(limit);
        return items.map((item: PlatformAuditItem): AuditEntryView => ({
            ...item,
            meta: { ...item.meta },
            createdAt: item.createdAt.toISOString()
        }));
    }
}
