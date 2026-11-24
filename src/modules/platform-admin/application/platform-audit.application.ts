import { Injectable } from '@nestjs/common';
import { PlatformAuditService } from '../services/platform-audit.service';
import { AuditEntryView } from '../validation/platform-audit.schemas';

@Injectable()
export class PlatformAuditApplication {
    public constructor(private readonly audit: PlatformAuditService) {}

    public async recent(limit: number): Promise<AuditEntryView[]> {
        return this.audit.recent(limit);
    }
}
