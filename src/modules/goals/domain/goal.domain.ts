import { Injectable } from '@nestjs/common';
import { HolderFilter } from '../../../shared/holder/holder-filter';
import { GoalHoldingsRepository } from '../repositories/goal-holdings.repository';
import { GoalsRepository } from '../repositories/goals.repository';
import { toGoal } from './goal.mapper';
import { Goal, GoalChanges, GoalHoldingLink, GoalHoldingRow, GoalPatch, GoalRow, NewGoalData } from './goals.types';

export function holdingKeyOf(kind: string, holdingId: string): string {
    return `${kind}:${holdingId}`;
}

@Injectable()
export class GoalDomain {
    public constructor(
        private readonly goals: GoalsRepository,
        private readonly holdings: GoalHoldingsRepository
    ) {}

    public async lockWrites(): Promise<void> {
        await this.goals.lockWrites();
    }

    public async countAll(): Promise<number> {
        return this.goals.countAll();
    }

    public async list(filter: HolderFilter): Promise<Goal[]> {
        const rows: GoalRow[] = await this.goals.listByHolder(filter);
        const links: Map<string, GoalHoldingRow[]> = groupByGoal(
            await this.holdings.listByGoals(rows.map((row: GoalRow): string => row.id))
        );
        return rows.map((row: GoalRow): Goal => toGoal(row, links.get(row.id) ?? []));
    }

    public async findById(id: string): Promise<Goal | null> {
        const row: GoalRow | null = await this.goals.findById(id);
        return row === null ? null : toGoal(row, await this.holdings.listByGoals([id]));
    }

    public async findReserveOf(holderUserId: string | null): Promise<Goal | null> {
        const row: GoalRow | null = await this.goals.findReserveOf(holderUserId);
        return row === null ? null : toGoal(row, []);
    }

    public async allocatedBpsByHolding(excludeGoalId: string | null): Promise<Map<string, number>> {
        const allocated: Map<string, number> = new Map();
        for (const row of await this.holdings.listAll()) {
            if (row.goalId !== excludeGoalId) {
                const key: string = holdingKeyOf(row.holdingKind, row.holdingId);
                allocated.set(key, (allocated.get(key) ?? 0) + row.shareBps);
            }
        }
        return allocated;
    }

    public async create(data: NewGoalData, links: readonly GoalHoldingLink[]): Promise<Goal> {
        const row: GoalRow = await this.goals.insert({
            kind: data.kind,
            name: data.name,
            targetMinor: data.targetMinor,
            targetDate: data.targetDate,
            holderUserId: data.holderUserId,
            manualMinor: data.manualMinor,
            manualUpdatedAt: data.manualMinor > 0 ? new Date() : null,
            planStartMonth: data.plan.startMonth,
            planStartMinor: data.plan.startMinor,
            planMonths: data.plan.months,
            monthStartMonth: data.monthStart.month,
            monthStartMinor: data.monthStart.minor
        });
        return toGoal(row, await this.holdings.insertMany(row.id, links));
    }

    public async update(id: string, changes: GoalChanges, links: readonly GoalHoldingLink[] | undefined): Promise<Goal | null> {
        const row: GoalRow | null = await this.goals.patch(id, patchOf(changes));
        if (row === null) {
            return null;
        }
        if (links !== undefined) {
            await this.holdings.softDeleteByGoal(id);
            await this.holdings.insertMany(id, links);
        }
        return this.findById(id);
    }

    public async remove(id: string): Promise<boolean> {
        const row: GoalRow | null = await this.goals.softDelete(id);
        if (row === null) {
            return false;
        }
        await this.holdings.softDeleteByGoal(id);
        return true;
    }
}

function groupByGoal(rows: readonly GoalHoldingRow[]): Map<string, GoalHoldingRow[]> {
    const grouped: Map<string, GoalHoldingRow[]> = new Map();
    for (const row of rows) {
        grouped.set(row.goalId, [...(grouped.get(row.goalId) ?? []), row]);
    }
    return grouped;
}

function patchOf(changes: GoalChanges): GoalPatch {
    return {
        name: changes.name,
        targetMinor: changes.targetMinor,
        targetDate: changes.targetDate,
        holderUserId: changes.holderUserId,
        manualMinor: changes.manualMinor,
        manualUpdatedAt: changes.manualMinor === undefined ? undefined : new Date(),
        planStartMonth: changes.plan?.startMonth,
        planStartMinor: changes.plan?.startMinor,
        planMonths: changes.plan?.months
    };
}
