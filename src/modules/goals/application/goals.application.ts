import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { HolderFilter } from '../../../shared/holder/holder-filter';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { ExpenseAverage, SpendingExpenseAverageService } from '../../spending-summary/services/spending-expense-average.service';
import { firstOfMonth, planMonthsBetween } from '../domain/goal-calculator';
import { GoalDomain } from '../domain/goal.domain';
import { GoalNotFoundError } from '../domain/goals.errors';
import { CreateGoalInput, Goal, GoalChanges, GoalPlan, ReserveBasis, UpdateGoalInput } from '../domain/goals.types';
import { reserveBaseOf, suggestedReserveMinor } from '../domain/reserve-review';
import { GoalCreationService } from '../services/goal-creation.service';
import { GoalRulesService, reserveOf, reviewOf } from '../services/goal-rules.service';
import { balanceOfLinks, HoldingIndex, toGoalsList, toGoalView } from '../services/goal-view.mapper';
import { EmergencySuggestion, GoalsList, GoalView } from '../validation/goals.schemas';

function restartedPlanOf(current: Goal, input: UpdateGoalInput, holdings: HoldingIndex, today: string): GoalPlan {
    const month: string = firstOfMonth(today);
    return {
        startMonth: month,
        startMinor: balanceOfLinks(input.manualMinor ?? current.manualMinor, input.holdings ?? current.holdings, holdings),
        months: planMonthsBetween(month, input.targetDate ?? current.targetDate)
    };
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
        private readonly rules: GoalRulesService,
        private readonly creation: GoalCreationService,
        private readonly timezones: CompanyTimezoneService,
        private readonly spending: SpendingExpenseAverageService
    ) {}

    public async list(filter: HolderFilter): Promise<GoalsList> {
        const today: string = await this.timezones.todayInCompany();
        const holdings: HoldingIndex = await this.rules.holdingIndex();
        const goals: Goal[] = await this.goals.list(filter);
        const average: ExpenseAverage | null = await this.rules.averageFor(goals);
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
        return toGoalView(goal, await this.rules.holdingIndex(), today, reviewOf(goal, await this.rules.averageFor([goal])));
    }

    public async create(input: CreateGoalInput): Promise<GoalView> {
        return this.creation.create(input);
    }

    @UsingTransaction()
    public async update(id: string, input: UpdateGoalInput): Promise<GoalView> {
        await this.goals.lockWrites();
        const current: Goal = await this.require(id);
        const today: string = await this.timezones.todayInCompany();
        const holdings: HoldingIndex = await this.rules.holdingIndex();
        if (input.holdings !== undefined) {
            await this.rules.assertLinks(input.holdings, holdings, id);
        }
        const changes: GoalChanges = await this.changesOf(current, input, holdings, today);
        const updated: Goal | null = await this.goals.update(id, changes, input.holdings);
        if (updated === null) {
            throw new GoalNotFoundError(id);
        }
        return toGoalView(updated, holdings, today, reviewOf(updated, await this.rules.averageFor([updated])));
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

    private async changesOf(current: Goal, input: UpdateGoalInput, holdings: HoldingIndex, today: string): Promise<GoalChanges> {
        const holderUserId: string | null | undefined = await this.newHolderOf(current, input.holderUserId);
        if (input.targetDate !== undefined && input.targetDate !== current.targetDate) {
            this.rules.assertFuture(input.targetDate, today);
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
        const holderUserId: string | null = await this.rules.holderOf(requested);
        await this.rules.assertReserveFree(current.kind, holderUserId, current.id);
        return holderUserId;
    }
}
