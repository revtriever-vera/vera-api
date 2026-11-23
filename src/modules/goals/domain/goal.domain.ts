import { Injectable } from '@nestjs/common';
import { HolderFilter } from '../../../shared/holder/holder-filter';
import { GoalHoldingsRepository } from '../repositories/goal-holdings.repository';
import { GoalsRepository } from '../repositories/goals.repository';
import { isFirstOfMonth, noticeLeadDate } from './goal-notice-due';
import { toGoal } from './goal.mapper';
import { Goal, GOAL_KINDS, GoalChanges, GoalHoldingLink, GoalHoldingRow, GoalPatch, GoalRow, NewGoalData } from './goals.types';

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

    public async listReal(): Promise<Goal[]> {
        const rows: GoalRow[] = await this.goals.listReal();
        return this.withLinks(rows);
    }

    public async companyIdsDueAcrossTenants(today: string): Promise<string[]> {
        return this.goals.companyIdsWithRealGoalsAcrossTenants(isFirstOfMonth(today) ? null : noticeLeadDate(today));
    }

    public async hasSamples(): Promise<boolean> {
        return (await this.goals.listSamples()).length > 0;
    }

    public async removeSamples(): Promise<number> {
        const rows: GoalRow[] = await this.goals.listSamples();
        for (const row of rows) {
            await this.goals.softDelete(row.id);
        }
        await this.holdings.softDeleteByGoals(rows.map((row: GoalRow): string => row.id));
        return rows.length;
    }

    /**
     * The person left the account: what was theirs becomes the whole account's. A reserve cannot sit next to another
     * whole-account reserve (one per holder), so it turns into a plain goal and loses its spending-based basis.
     */
    public async releaseHolder(userId: string): Promise<number> {
        const rows: GoalRow[] = await this.goals.listOfHolder(userId);
        for (const row of rows) {
            const collides: boolean = row.kind === GOAL_KINDS.emergencyReserve && (await this.goals.findReserveOf(null)) !== null;
            await this.goals.patch(
                row.id,
                collides
                    ? { holderUserId: null, kind: GOAL_KINDS.other, reserveMonths: null, reserveBaseMinor: null }
                    : { holderUserId: null }
            );
        }
        return rows.length;
    }

    private async withLinks(rows: readonly GoalRow[]): Promise<Goal[]> {
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
            monthStartMinor: data.monthStart.minor,
            reserveMonths: data.reserve?.months ?? null,
            reserveBaseMinor: data.reserve?.baseMinor ?? null,
            isSample: data.isSample ?? false
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
        planMonths: changes.plan?.months,
        reserveMonths: changes.reserve?.months,
        reserveBaseMinor: changes.reserve?.baseMinor
    };
}
