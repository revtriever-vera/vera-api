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
    | 'isSample'
>;

function localDateOf(isoDate: string): Date {
    const [year, month, day]: string[] = isoDate.split('-');
    return new Date(Number(year), Number(month) - 1, Number(day));
}

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

    public async listReal(): Promise<GoalRow[]> {
        return this.findMany({ isSample: false }, { limit: MAX_GOALS_PER_COMPANY, orderBy: [{ property: 'createdAt', direction: 'asc' }] });
    }

    public async listSamples(): Promise<GoalRow[]> {
        return this.findMany({ isSample: true }, { limit: MAX_GOALS_PER_COMPANY });
    }

    public async listOfHolder(userId: string): Promise<GoalRow[]> {
        return this.findMany({ holderUserId: userId }, { limit: MAX_GOALS_PER_COMPANY });
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

    public async companyIdsWithRealGoalsAcrossTenants(targetDate: string | null): Promise<string[]> {
        const rows: { companyId: string }[] = await this.selectSkipConstraint()
            .select('companyId')
            .distinct()
            .where('deletedAt', 'is', null)
            .where('isSample', '=', false)
            .$if(targetDate !== null, (builder) => builder.where('targetDate', '=', localDateOf(targetDate ?? '')))
            .execute();
        return rows.map((row: { companyId: string }): string => row.companyId);
    }

    public async patch(id: string, patch: GoalPatch): Promise<GoalRow | null> {
        return this.updateRow(id, patch);
    }

    public async softDelete(id: string): Promise<GoalRow | null> {
        return this.softDeleteRow(id);
    }
}
