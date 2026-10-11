import { Injectable } from '@nestjs/common';
import { HashUtil } from '../../../shared/utils/hash.util';
import { AccountDeletionLogRepository } from '../repositories/account-deletion-log.repository';
import { AccountDeletionRecord, ErasedArea } from './identity.types';

export interface DeletionTrail {
    readonly companyId: string;
    readonly requestedAt: Date;
    readonly completedAt: Date;
    readonly areas: readonly ErasedArea[];
}

@Injectable()
export class AccountDeletionLogDomain {
    public constructor(private readonly log: AccountDeletionLogRepository) {}

    public hashOf(companyId: string): string {
        return HashUtil.sha256(companyId);
    }

    public async record(trail: DeletionTrail): Promise<AccountDeletionRecord> {
        return this.log.create({
            companyHash: this.hashOf(trail.companyId),
            requestedAt: trail.requestedAt,
            completedAt: trail.completedAt,
            areas: JSON.stringify(trail.areas)
        });
    }

    public async findByCompanyId(companyId: string): Promise<AccountDeletionRecord[]> {
        return this.log.findByCompanyHash(this.hashOf(companyId));
    }
}
