import { Injectable } from '@nestjs/common';
// eslint-disable-next-line local/repository-escape -- o índice único de posição é por expressão (COALESCE do holder): o ON CONFLICT só se escreve em SQL
import { sql } from 'kysely';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { HolderFilter, holderWhereOf } from '../../../shared/holder/holder-filter';
import { IdUtil } from '../../../shared/utils/id.util';
import { NewPosition, Position, PositionPatch } from '../domain/positions.types';

type CreatePositionData = Pick<NewPosition, 'assetId' | 'quantity' | 'averagePrice' | 'isSample' | 'holderUserId'>;

const POSITION_LIMIT: number = 1000;
const NO_HOLDER_KEY: string = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class PositionsRepository extends TenantRepository<'Positions'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'Positions');
    }

    public async insertIfAbsent(data: CreatePositionData): Promise<Position | null> {
        const inserted: Position | undefined = await this.insertBuilder()
            .values({ id: IdUtil.newId(), companyId: this.companyId, ...data })
            .onConflict((conflict) =>
                conflict
                    .expression(sql`"companyId", "assetId", (COALESCE("holderUserId", ${sql.lit(NO_HOLDER_KEY)}::uuid))`)
                    .where('deletedAt', 'is', null)
                    .doNothing()
            )
            .returningAll()
            .executeTakeFirst();
        return inserted ?? null;
    }

    public async findByAssetAndHolder(assetId: string, holderUserId: string | null): Promise<Position | null> {
        return this.findOne({ assetId, holderUserId });
    }

    public async listByHolder(filter: HolderFilter): Promise<Position[]> {
        return this.findMany(holderWhereOf(filter), { limit: POSITION_LIMIT, orderBy: [{ property: 'createdAt', direction: 'desc' }] });
    }

    public async listAll(): Promise<Position[]> {
        return this.findMany({}, { limit: POSITION_LIMIT, orderBy: [{ property: 'createdAt', direction: 'desc' }] });
    }

    public async listReal(): Promise<Position[]> {
        return this.findMany({ isSample: false }, { limit: POSITION_LIMIT, orderBy: [{ property: 'createdAt', direction: 'asc' }] });
    }

    public async countReal(): Promise<number> {
        return (await this.findMany({ isSample: false }, { limit: POSITION_LIMIT })).length;
    }

    public async softDeleteSamples(): Promise<Position[]> {
        return this.updateManyRows({ isSample: true }, { deletedAt: new Date() });
    }

    public async countAll(): Promise<number> {
        const row: { total: string | number | bigint } | undefined = await this.selectScoped()
            .select((builder) => builder.fn.countAll().as('total'))
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
        const rows: { assetId: string }[] = await this.selectSkipConstraint()
            .select('assetId')
            .distinct()
            .where('deletedAt', 'is', null)
            .orderBy('assetId')
            .execute();
        return rows.map((row: { assetId: string }): string => row.assetId);
    }
}
