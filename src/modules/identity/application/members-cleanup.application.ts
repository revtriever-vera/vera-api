import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { User } from '../domain/identity.types';
import { UserDomain } from '../domain/user.domain';
import { MembersLogService } from '../services/members-log.service';

const RETENTION_DAYS: number = 30;
const BATCH: number = 200;
const DAY_MS: number = 24 * 60 * 60 * 1000;

@Injectable()
export class MembersCleanupApplication {
    public constructor(
        private readonly users: UserDomain,
        private readonly logs: MembersLogService
    ) {}

    public async anonymizeRemoved(now: Date = new Date()): Promise<number> {
        const cutoff: Date = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
        const removed: User[] = await this.users.findRemovedToAnonymize(cutoff, BATCH);
        for (const user of removed) {
            await this.anonymizeOne(user.companyId, user.id);
        }
        this.logs.anonymized(removed.length);
        return removed.length;
    }

    @AsCompany()
    private async anonymizeOne(_companyId: string, userId: string): Promise<void> {
        await this.users.anonymize(userId);
    }
}
