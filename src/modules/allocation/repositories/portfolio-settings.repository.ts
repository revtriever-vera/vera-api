import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { DEFAULT_BASE_CURRENCY, DEFAULT_TOLERANCE_BPS, NewPortfolioSettings, PortfolioSettingsRow } from '../domain/allocation.types';

export type UpdateSettingsData = Partial<Pick<NewPortfolioSettings, 'baseCurrency' | 'toleranceBps'>>;

@Injectable()
export class PortfolioSettingsRepository extends TenantRepository<'PortfolioSettings'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'PortfolioSettings');
    }

    public async findCurrent(): Promise<PortfolioSettingsRow | null> {
        return this.findOne({});
    }

    public async insertDefaultIfMissing(): Promise<void> {
        await this.db
            .insertInto(this.table)
            .values({
                id: IdUtil.newId(),
                companyId: this.companyId,
                baseCurrency: DEFAULT_BASE_CURRENCY,
                toleranceBps: DEFAULT_TOLERANCE_BPS
            })
            .onConflict((conflict) => conflict.doNothing())
            .execute();
    }

    public async updateFields(id: string, data: UpdateSettingsData): Promise<PortfolioSettingsRow | null> {
        return this.updateRow(id, data);
    }
}
