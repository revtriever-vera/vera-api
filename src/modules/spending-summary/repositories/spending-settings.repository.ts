import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { NewSpendingSettings, SpendingSettingsRow } from '../domain/spending-summary.types';

export type UpdateSettingsData = Partial<Pick<NewSpendingSettings, 'savingsGoalBps' | 'incomeMode' | 'declaredIncomeMinor'>>;

@Injectable()
export class SpendingSettingsRepository extends TenantRepository<'SpendingSettings'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'SpendingSettings');
    }

    public async findCurrent(): Promise<SpendingSettingsRow | null> {
        return this.findOne({});
    }

    public async insertDefaultIfMissing(): Promise<void> {
        await this.db
            .insertInto(this.table)
            .values({ id: IdUtil.newId(), companyId: this.companyId })
            .onConflict((conflict) => conflict.doNothing())
            .execute();
    }

    public async updateFields(id: string, data: UpdateSettingsData): Promise<SpendingSettingsRow | null> {
        return this.updateRow(id, data);
    }
}
