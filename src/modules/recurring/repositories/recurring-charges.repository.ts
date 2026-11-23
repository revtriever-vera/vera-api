import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { CHARGE_ROLES, ChargeRow, DesiredCharge } from '../domain/recurring-series.types';

const CHARGES_LIMIT: number = 200_000;
const INSERT_CHUNK: number = 500;

@Injectable()
export class RecurringChargesRepository extends TenantRepository<'RecurringCharges'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'RecurringCharges');
    }

    public async listAll(): Promise<ChargeRow[]> {
        return this.findMany({}, { limit: CHARGES_LIMIT });
    }

    public async listBySeriesIds(seriesIds: readonly string[]): Promise<ChargeRow[]> {
        return seriesIds.length === 0 ? [] : this.findMany({ seriesId: [...seriesIds] }, { limit: CHARGES_LIMIT });
    }

    public async listBySeries(seriesId: string): Promise<ChargeRow[]> {
        return this.findMany({ seriesId }, { limit: CHARGES_LIMIT });
    }

    public async listExcludedTransactionIds(): Promise<string[]> {
        const rows: ChargeRow[] = await this.findMany({ role: CHARGE_ROLES.excluded }, { limit: CHARGES_LIMIT });
        return rows.map((row: ChargeRow): string => row.transactionId);
    }

    public async findLink(seriesId: string, transactionId: string): Promise<ChargeRow | null> {
        return this.findOne({ seriesId, transactionId });
    }

    public async findByTransaction(transactionId: string): Promise<ChargeRow[]> {
        return this.findMany({ transactionId }, { limit: 100 });
    }

    public async insertMany(seriesId: string, charges: readonly DesiredCharge[]): Promise<void> {
        for (let from: number = 0; from < charges.length; from += INSERT_CHUNK) {
            await this.createManyRows(
                charges.slice(from, from + INSERT_CHUNK).map((charge: DesiredCharge) => ({
                    id: IdUtil.newId(),
                    companyId: this.companyId,
                    seriesId,
                    transactionId: charge.transactionId,
                    role: charge.role
                }))
            );
        }
    }

    public async softDeleteMany(ids: readonly string[]): Promise<void> {
        if (ids.length > 0) {
            await this.updateManyRows({ id: [...ids] }, { deletedAt: new Date() });
        }
    }

    public async setRole(id: string, role: string): Promise<void> {
        await this.updateRow(id, { role });
    }
}
