import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';

@Injectable()
export class UserRecoveryCodesRepository extends TenantRepository<'UserRecoveryCodes'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'UserRecoveryCodes');
    }

    public async replaceForUser(userId: string, codeHashes: readonly string[]): Promise<void> {
        await this.removeForUser(userId);
        await this.createManyRows(
            codeHashes.map((codeHash: string) => ({ id: IdUtil.newId(), companyId: this.companyId, userId, codeHash }))
        );
    }

    public async consume(userId: string, codeHash: string): Promise<boolean> {
        const used: unknown[] = await this.updateManyRows({ userId, codeHash, usedAt: null }, { usedAt: new Date() });
        return used.length > 0;
    }

    public async removeForUser(userId: string): Promise<void> {
        await this.updateManyRows({ userId }, { deletedAt: new Date() });
    }
}
