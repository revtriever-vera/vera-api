import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { UserTotp } from '../domain/identity.types';

@Injectable()
export class UserTotpsRepository extends TenantRepository<'UserTotps'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'UserTotps');
    }

    public async findByUserId(userId: string): Promise<UserTotp | null> {
        return this.findOne({ userId });
    }

    public async savePending(userId: string, secretEncrypted: string): Promise<UserTotp> {
        const existing: UserTotp | null = await this.findByUserId(userId);
        if (existing) {
            return (await this.updateRow(existing.id, { secretEncrypted })) ?? existing;
        }
        return this.createRow({ id: IdUtil.newId(), companyId: this.companyId, userId, secretEncrypted });
    }

    public async activate(totpId: string, step: number, at: Date): Promise<void> {
        await this.updateRow(totpId, { activatedAt: at, lastUsedStep: step });
    }

    public async claimStep(totpId: string, step: number): Promise<boolean> {
        const advanced: UserTotp[] = await this.updateManyRows({ id: totpId, lastUsedStep: { '<': step } }, { lastUsedStep: step });
        if (advanced.length > 0) {
            return true;
        }
        const first: UserTotp[] = await this.updateManyRows({ id: totpId, lastUsedStep: null }, { lastUsedStep: step });
        return first.length > 0;
    }

    public async removeForUser(userId: string): Promise<void> {
        await this.updateManyRows({ userId }, { deletedAt: new Date() });
    }
}
