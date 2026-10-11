import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
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

    public async upsertLink(connectionId: string, accountId: string, externalAccountId: string): Promise<BankConnectionAccount> {
        return this.db
            .insertInto('BankConnectionAccounts')
            .values({ id: IdUtil.newId(), companyId: this.companyId, connectionId, accountId, externalAccountId })
            .onConflict((conflict) =>
                conflict
                    .columns(['companyId', 'connectionId', 'externalAccountId'])
                    .where('deletedAt', 'is', null)
                    .doUpdateSet({ accountId, updatedAt: new Date() })
            )
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    public async advance(id: string, syncedThrough: string): Promise<BankConnectionAccount | null> {
        return this.updateRow(id, { syncedThrough });
    }
}
