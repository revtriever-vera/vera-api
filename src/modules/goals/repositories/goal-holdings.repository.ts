import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { GoalHoldingLink, GoalHoldingRow, MAX_GOALS_PER_COMPANY, MAX_HOLDINGS_PER_GOAL } from '../domain/goals.types';

const LIST_LIMIT: number = MAX_GOALS_PER_COMPANY * MAX_HOLDINGS_PER_GOAL;

@Injectable()
export class GoalHoldingsRepository extends TenantRepository<'GoalHoldings'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'GoalHoldings');
    }

    public async listByGoals(goalIds: readonly string[]): Promise<GoalHoldingRow[]> {
        if (goalIds.length === 0) {
            return [];
        }
        return this.findMany({ goalId: goalIds }, { limit: LIST_LIMIT, orderBy: [{ property: 'createdAt', direction: 'asc' }] });
    }

    public async listAll(): Promise<GoalHoldingRow[]> {
        return this.findMany({}, { limit: LIST_LIMIT });
    }

    public async insertMany(goalId: string, links: readonly GoalHoldingLink[]): Promise<GoalHoldingRow[]> {
        return this.createManyRows(
            links.map((link: GoalHoldingLink) => ({
                id: IdUtil.newId(),
                companyId: this.companyId,
                goalId,
                holdingKind: link.kind,
                holdingId: link.holdingId,
                shareBps: link.shareBps
            }))
        );
    }

    public async softDeleteByGoal(goalId: string): Promise<void> {
        await this.updateManyRows({ goalId }, { deletedAt: new Date() });
    }
}
