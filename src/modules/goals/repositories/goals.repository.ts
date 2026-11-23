import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { HolderFilter, holderWhereOf } from '../../../shared/holder/holder-filter';
import { IdUtil } from '../../../shared/utils/id.util';
import { GOAL_KINDS, GoalPatch, GoalRow, MAX_GOALS_PER_COMPANY, NewGoal } from '../domain/goals.types';

type GoalFields = Pick<
    NewGoal,
    | 'kind'
    | 'name'
    | 'targetMinor'
    | 'targetDate'
    | 'holderUserId'
    | 'manualMinor'
    | 'manualUpdatedAt'
    | 'planStartMonth'
    | 'planStartMinor'
    | 'planMonths'
    | 'monthStartMonth'
    | 'monthStartMinor'
    | 'reserveMonths'
    | 'reserveBaseMinor'
>;

@Injectable()
export class GoalsRepository extends TenantRepository<'Goals'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'Goals');
    }

    public async lockWrites(): Promise<void> {
        // eslint-disable-next-line local/repository-escape -- o advisory lock não tem linha nem tabela: serializa as escritas de objetivos de uma company
        await this.rawSql`SELECT pg_advisory_xact_lock(hashtext(${'goals:' + this.companyId}))`.execute(this.db);
    }

    public async insert(fields: GoalFields): Promise<GoalRow> {
        return this.createRow({ id: IdUtil.newId(), companyId: this.companyId, ...fields });
    }

    public async listByHolder(filter: HolderFilter): Promise<GoalRow[]> {
        return this.findMany(holderWhereOf(filter), {
            limit: MAX_GOALS_PER_COMPANY,
            orderBy: [
                { property: 'targetDate', direction: 'asc' },
                { property: 'createdAt', direction: 'asc' }
            ]
        });
    }

    public async findReserveOf(holderUserId: string | null): Promise<GoalRow | null> {
        return this.findOne({ kind: GOAL_KINDS.emergencyReserve, holderUserId });
    }

    public async countAll(): Promise<number> {
        const row: { total: string | number | bigint } | undefined = await this.selectScoped()
            .select((builder) => builder.fn.countAll().as('total'))
            .executeTakeFirst();
        return Number(row?.total ?? 0);
    }

    public async patch(id: string, patch: GoalPatch): Promise<GoalRow | null> {
        return this.updateRow(id, patch);
    }

    public async softDelete(id: string): Promise<GoalRow | null> {
        return this.softDeleteRow(id);
    }
}
