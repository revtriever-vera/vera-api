import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { NewPosition, Position, PositionPatch } from '../domain/positions.types';

type CreatePositionData = Pick<NewPosition, 'assetId' | 'quantity' | 'averagePrice'>;

const POSITION_LIMIT: number = 1000;

@Injectable()
export class PositionsRepository extends TenantRepository<'Positions'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'Positions');
    }

    public async insertIfAbsent(data: CreatePositionData): Promise<Position | null> {
        const inserted: Position | undefined = await this.db
            .insertInto('Positions')
            .values({ id: IdUtil.newId(), companyId: this.companyId, ...data })
            .onConflict((conflict) => conflict.columns(['companyId', 'assetId']).where('deletedAt', 'is', null).doNothing())
            .returningAll()
            .executeTakeFirst();
        return inserted ?? null;
    }

    public async findByAsset(assetId: string): Promise<Position | null> {
        return this.findOne({ assetId });
    }

    public async listAll(): Promise<Position[]> {
        return this.findMany({}, { limit: POSITION_LIMIT, orderBy: [{ property: 'createdAt', direction: 'desc' }] });
    }

    public async countAll(): Promise<number> {
        const row: { total: string | number | bigint } | undefined = await this.db
            .selectFrom('Positions')
            .select((builder) => builder.fn.countAll().as('total'))
            .where('companyId', '=', this.companyId)
            .where('deletedAt', 'is', null)
            .executeTakeFirst();
        return Number(row?.total ?? 0);
    }

    public async patch(id: string, patch: PositionPatch): Promise<Position | null> {
        return this.updateRow(id, patch);
    }

    public async softDelete(id: string): Promise<Position | null> {
        return this.softDeleteRow(id);
    }

    public async listHeldAssetIdsAcrossTenants(): Promise<string[]> {
        const rows: { assetId: string }[] = await this.db
            .selectFrom('Positions')
            .select('assetId')
            .distinct()
            .where('deletedAt', 'is', null)
            .orderBy('assetId')
            .execute();
        return rows.map((row: { assetId: string }): string => row.assetId);
    }
}
