import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { AccountDeletionRecord, NewAccountDeletionRecord } from '../domain/identity.types';

type CreateDeletionRecordData = Pick<NewAccountDeletionRecord, 'companyHash' | 'requestedAt' | 'completedAt' | 'areas'>;

@Injectable()
export class AccountDeletionLogRepository extends BareGlobalRepository<'AccountDeletionLog'> {
    public constructor(database: DatabaseClient) {
        super(database, 'AccountDeletionLog');
    }

    public async create(data: CreateDeletionRecordData): Promise<AccountDeletionRecord> {
        return this.createRow({ id: IdUtil.newId(), ...data });
    }

    public async findByCompanyHash(companyHash: string): Promise<AccountDeletionRecord[]> {
        return this.findMany({ companyHash });
    }
}
