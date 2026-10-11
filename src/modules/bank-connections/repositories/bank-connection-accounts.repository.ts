import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { BankConnectionAccount } from '../domain/bank-connections.types';

@Injectable()
export class BankConnectionAccountsRepository extends TenantRepository<'BankConnectionAccounts'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'BankConnectionAccounts');
    }

    public async listByConnections(connectionIds: readonly string[]): Promise<BankConnectionAccount[]> {
        return this.findManyWhereIn('connectionId', connectionIds);
    }

    public async unlinkConnections(connectionIds: readonly string[]): Promise<BankConnectionAccount[]> {
        if (connectionIds.length === 0) {
            return [];
        }
        return this.updateManyRows({ connectionId: [...connectionIds] }, { deletedAt: new Date() });
    }
}
