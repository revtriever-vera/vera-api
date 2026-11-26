import { Injectable } from '@nestjs/common';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { MemberDirectoryService } from '../../identity/services/member-directory.service';
import { PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { ExpenseAverage, SpendingExpenseAverageService } from '../../spending-summary/services/spending-expense-average.service';
import { reserveBaseOf, ReserveReview, reviewReserve } from '../domain/reserve-review';
import { GoalDomain, holdingKeyOf } from '../domain/goal.domain';
import {
    EmergencyReserveExistsError,
    GoalHoldingNotFoundError,
    GoalHoldingOverallocatedError,
    GoalLimitReachedError,
    GoalTargetDateInPastError,
    ReserveMonthsNotAllowedError
} from '../domain/goals.errors';
import { FULL_SHARE_BPS, Goal, GOAL_KINDS, GoalHoldingLink, MAX_GOALS_PER_COMPANY, ReserveBasis } from '../domain/goals.types';
import { HoldingIndex, indexHoldings } from './goal-view.mapper';

export function reserveOf(kind: string, months: number | undefined, targetMinor: number): ReserveBasis | null {
    if (months === undefined) {
        return null;
    }
    if (kind !== GOAL_KINDS.emergencyReserve) {
        throw new ReserveMonthsNotAllowedError(kind);
    }
    return { months, baseMinor: reserveBaseOf(targetMinor, months) };
}

export function reviewOf(goal: Goal, average: ExpenseAverage | null): ReserveReview | null {
    return goal.reserve === null || average === null ? null : reviewReserve(goal.reserve, average.averageMinor);
}

@Injectable()
export class GoalRulesService {
    public constructor(
        private readonly goals: GoalDomain,
        private readonly snapshots: PortfolioSnapshotService,
        private readonly members: MemberDirectoryService,
        private readonly spending: SpendingExpenseAverageService
    ) {}

    public async averageFor(goals: readonly Goal[]): Promise<ExpenseAverage | null> {
        return goals.some((goal: Goal): boolean => goal.reserve !== null) ? this.spending.trailing() : null;
    }

    public async holdingIndex(): Promise<HoldingIndex> {
        return indexHoldings(await this.snapshots.build(ANY_HOLDER));
    }

    public async holderOf(requested: string | null | undefined): Promise<string | null> {
        if (requested === undefined || requested === null) {
            return null;
        }
        return (await this.members.requireActive(requested)).userId;
    }

    public assertFuture(targetDate: string, today: string): void {
        if (targetDate <= today) {
            throw new GoalTargetDateInPastError(targetDate);
        }
    }

    public async assertRoom(): Promise<void> {
        if ((await this.goals.countAll()) >= MAX_GOALS_PER_COMPANY) {
            throw new GoalLimitReachedError(MAX_GOALS_PER_COMPANY);
        }
    }

    public async assertReserveFree(kind: string, holderUserId: string | null, ownId: string | null): Promise<void> {
        if (kind !== GOAL_KINDS.emergencyReserve) {
            return;
        }
        const existing: Goal | null = await this.goals.findReserveOf(holderUserId);
        if (existing !== null && existing.id !== ownId) {
            throw new EmergencyReserveExistsError(existing.id);
        }
    }

    public async assertLinks(links: readonly GoalHoldingLink[], holdings: HoldingIndex, ownGoalId: string | null): Promise<void> {
        const allocated: Map<string, number> = await this.goals.allocatedBpsByHolding(ownGoalId);
        for (const link of links) {
            const key: string = holdingKeyOf(link.kind, link.holdingId);
            if (!holdings.has(key)) {
                throw new GoalHoldingNotFoundError(link.kind, link.holdingId);
            }
            const freeBps: number = FULL_SHARE_BPS - (allocated.get(key) ?? 0);
            if (link.shareBps > freeBps) {
                throw new GoalHoldingOverallocatedError(link.kind, link.holdingId, freeBps);
            }
        }
    }
}
