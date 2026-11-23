import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { ANY_HOLDER, HolderFilter } from '../../../shared/holder/holder-filter';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { MemberDirectoryService } from '../../identity/services/member-directory.service';
import { ExpenseAverage, SpendingExpenseAverageService } from '../../spending-summary/services/spending-expense-average.service';
import { PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { firstOfMonth, planMonthsBetween } from '../domain/goal-calculator';
import { GoalDomain, holdingKeyOf } from '../domain/goal.domain';
import {
    EmergencyReserveExistsError,
    GoalHoldingNotFoundError,
    GoalHoldingOverallocatedError,
    GoalLimitReachedError,
    GoalNotFoundError,
    GoalTargetDateInPastError,
    ReserveMonthsNotAllowedError
} from '../domain/goals.errors';
import {
    CreateGoalInput,
    FULL_SHARE_BPS,
    Goal,
    GOAL_KINDS,
    GoalChanges,
    GoalHoldingLink,
    GoalPlan,
    MAX_GOALS_PER_COMPANY,
    NewGoalData,
    ReserveBasis,
    UpdateGoalInput
} from '../domain/goals.types';
import { reserveBaseOf, ReserveReview, reviewReserve, suggestedReserveMinor } from '../domain/reserve-review';
import { balanceOfLinks, HoldingIndex, indexHoldings, toGoalsList, toGoalView } from '../services/goal-view.mapper';
import { EmergencySuggestion, GoalsList, GoalView } from '../validation/goals.schemas';

function reserveOf(kind: string, months: number | undefined, targetMinor: number): ReserveBasis | null {
    if (months === undefined) {
        return null;
    }
    if (kind !== GOAL_KINDS.emergencyReserve) {
        throw new ReserveMonthsNotAllowedError(kind);
    }
    return { months, baseMinor: reserveBaseOf(targetMinor, months) };
}

function newGoalOf(input: CreateGoalInput, holderUserId: string | null, balanceMinor: number, today: string): NewGoalData {
    const month: string = firstOfMonth(today);
    return {
        kind: input.kind,
        name: input.name,
        targetMinor: input.targetMinor,
        targetDate: input.targetDate,
        holderUserId,
        manualMinor: input.manualMinor ?? 0,
        plan: { startMonth: month, startMinor: balanceMinor, months: planMonthsBetween(month, input.targetDate) },
        monthStart: { month, minor: balanceMinor },
        reserve: reserveOf(input.kind, input.reserveMonths, input.targetMinor)
    };
}

function restartedPlanOf(current: Goal, input: UpdateGoalInput, holdings: HoldingIndex, today: string): GoalPlan {
    const month: string = firstOfMonth(today);
    return {
        startMonth: month,
        startMinor: balanceOfLinks(input.manualMinor ?? current.manualMinor, input.holdings ?? current.holdings, holdings),
        months: planMonthsBetween(month, input.targetDate ?? current.targetDate)
    };
}

function reviewOf(goal: Goal, average: ExpenseAverage | null): ReserveReview | null {
    return goal.reserve === null || average === null ? null : reviewReserve(goal.reserve, average.averageMinor);
}

function reserveChangeOf(current: Goal, input: UpdateGoalInput, targetMinor: number): ReserveBasis | undefined {
    if (input.reserveMonths !== undefined) {
        return reserveOf(current.kind, input.reserveMonths, targetMinor) ?? undefined;
    }
    const retargeted: boolean = input.targetMinor !== undefined && input.targetMinor !== current.targetMinor;
    return current.reserve !== null && retargeted
        ? { months: current.reserve.months, baseMinor: reserveBaseOf(targetMinor, current.reserve.months) }
        : undefined;
}

@Injectable()
export class GoalsApplication {
    public constructor(
        private readonly goals: GoalDomain,
        private readonly snapshots: PortfolioSnapshotService,
        private readonly members: MemberDirectoryService,
        private readonly timezones: CompanyTimezoneService,
        private readonly spending: SpendingExpenseAverageService
    ) {}

    public async list(filter: HolderFilter): Promise<GoalsList> {
        const today: string = await this.timezones.todayInCompany();
        const holdings: HoldingIndex = await this.holdingIndex();
        const goals: Goal[] = await this.goals.list(filter);
        const average: ExpenseAverage | null = await this.averageFor(goals);
        return toGoalsList(goals.map((goal: Goal): GoalView => toGoalView(goal, holdings, today, reviewOf(goal, average))));
    }

    public async emergencySuggestion(months: number): Promise<EmergencySuggestion> {
        const average: ExpenseAverage = await this.spending.trailing();
        return {
            months,
            averageMinor: average.averageMinor,
            averageMonths: [...average.months],
            suggestedMinor: suggestedReserveMinor(average.averageMinor, months)
        };
    }

    public async get(id: string): Promise<GoalView> {
        const today: string = await this.timezones.todayInCompany();
        const goal: Goal = await this.require(id);
        return toGoalView(goal, await this.holdingIndex(), today, reviewOf(goal, await this.averageFor([goal])));
    }

    @UsingTransaction()
    public async create(input: CreateGoalInput): Promise<GoalView> {
        await this.goals.lockWrites();
        const today: string = await this.timezones.todayInCompany();
        this.assertFuture(input.targetDate, today);
        const holderUserId: string | null = await this.holderOf(input.holderUserId);
        await this.assertRoom();
        await this.assertReserveFree(input.kind, holderUserId, null);
        const holdings: HoldingIndex = await this.holdingIndex();
        await this.assertLinks(input.holdings, holdings, null);
        const balanceMinor: number = balanceOfLinks(input.manualMinor ?? 0, input.holdings, holdings);
        const created: Goal = await this.goals.create(newGoalOf(input, holderUserId, balanceMinor, today), input.holdings);
        return toGoalView(created, holdings, today, reviewOf(created, await this.averageFor([created])));
    }

    @UsingTransaction()
    public async update(id: string, input: UpdateGoalInput): Promise<GoalView> {
        await this.goals.lockWrites();
        const current: Goal = await this.require(id);
        const today: string = await this.timezones.todayInCompany();
        const holdings: HoldingIndex = await this.holdingIndex();
        if (input.holdings !== undefined) {
            await this.assertLinks(input.holdings, holdings, id);
        }
        const changes: GoalChanges = await this.changesOf(current, input, holdings, today);
        const updated: Goal | null = await this.goals.update(id, changes, input.holdings);
        if (updated === null) {
            throw new GoalNotFoundError(id);
        }
        return toGoalView(updated, holdings, today, reviewOf(updated, await this.averageFor([updated])));
    }

    @UsingTransaction()
    public async remove(id: string): Promise<void> {
        await this.goals.lockWrites();
        if (!(await this.goals.remove(id))) {
            throw new GoalNotFoundError(id);
        }
    }

    private async require(id: string): Promise<Goal> {
        const goal: Goal | null = await this.goals.findById(id);
        if (goal === null) {
            throw new GoalNotFoundError(id);
        }
        return goal;
    }

    private async averageFor(goals: readonly Goal[]): Promise<ExpenseAverage | null> {
        return goals.some((goal: Goal): boolean => goal.reserve !== null) ? this.spending.trailing() : null;
    }

    private async holdingIndex(): Promise<HoldingIndex> {
        return indexHoldings(await this.snapshots.build(ANY_HOLDER));
    }

    private async holderOf(requested: string | null | undefined): Promise<string | null> {
        if (requested === undefined || requested === null) {
            return null;
        }
        return (await this.members.requireActive(requested)).userId;
    }

    private assertFuture(targetDate: string, today: string): void {
        if (targetDate <= today) {
            throw new GoalTargetDateInPastError(targetDate);
        }
    }

    private async assertRoom(): Promise<void> {
        if ((await this.goals.countAll()) >= MAX_GOALS_PER_COMPANY) {
            throw new GoalLimitReachedError(MAX_GOALS_PER_COMPANY);
        }
    }

    private async assertReserveFree(kind: string, holderUserId: string | null, ownId: string | null): Promise<void> {
        if (kind !== GOAL_KINDS.emergencyReserve) {
            return;
        }
        const existing: Goal | null = await this.goals.findReserveOf(holderUserId);
        if (existing !== null && existing.id !== ownId) {
            throw new EmergencyReserveExistsError(existing.id);
        }
    }

    private async assertLinks(links: readonly GoalHoldingLink[], holdings: HoldingIndex, ownGoalId: string | null): Promise<void> {
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

    private async changesOf(current: Goal, input: UpdateGoalInput, holdings: HoldingIndex, today: string): Promise<GoalChanges> {
        const holderUserId: string | null | undefined = await this.newHolderOf(current, input.holderUserId);
        if (input.targetDate !== undefined && input.targetDate !== current.targetDate) {
            this.assertFuture(input.targetDate, today);
        }
        const targetMinor: number = input.targetMinor ?? current.targetMinor;
        const targetDate: string = input.targetDate ?? current.targetDate;
        const planChanged: boolean = targetMinor !== current.targetMinor || targetDate !== current.targetDate;
        return {
            name: input.name,
            targetMinor: input.targetMinor,
            targetDate: input.targetDate,
            holderUserId,
            manualMinor: input.manualMinor,
            plan: planChanged ? restartedPlanOf(current, input, holdings, today) : undefined,
            reserve: reserveChangeOf(current, input, targetMinor)
        };
    }

    private async newHolderOf(current: Goal, requested: string | null | undefined): Promise<string | null | undefined> {
        if (requested === undefined || requested === current.holderUserId) {
            return undefined;
        }
        const holderUserId: string | null = await this.holderOf(requested);
        await this.assertReserveFree(current.kind, holderUserId, current.id);
        return holderUserId;
    }
}
