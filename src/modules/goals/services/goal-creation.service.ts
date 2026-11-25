import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { firstOfMonth, planMonthsBetween } from '../domain/goal-calculator';
import { GoalDomain } from '../domain/goal.domain';
import { CreateGoalInput, Goal, NewGoalData } from '../domain/goals.types';
import { GoalView } from '../validation/goals.schemas';
import { HoldingIndex, balanceOfLinks, toGoalView } from './goal-view.mapper';
import { GoalRulesService, reserveOf, reviewOf } from './goal-rules.service';

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

@Injectable()
export class GoalCreationService {
    public constructor(
        private readonly goals: GoalDomain,
        private readonly rules: GoalRulesService,
        private readonly timezones: CompanyTimezoneService
    ) {}

    @UsingTransaction()
    public async create(input: CreateGoalInput): Promise<GoalView> {
        await this.goals.lockWrites();
        const today: string = await this.timezones.todayInCompany();
        this.rules.assertFuture(input.targetDate, today);
        const holderUserId: string | null = await this.rules.holderOf(input.holderUserId);
        await this.rules.assertRoom();
        await this.rules.assertReserveFree(input.kind, holderUserId, null);
        const holdings: HoldingIndex = await this.rules.holdingIndex();
        await this.rules.assertLinks(input.holdings, holdings, null);
        const balanceMinor: number = balanceOfLinks(input.manualMinor ?? 0, input.holdings, holdings);
        const created: Goal = await this.goals.create(newGoalOf(input, holderUserId, balanceMinor, today), input.holdings);
        return toGoalView(created, holdings, today, reviewOf(created, await this.rules.averageFor([created])));
    }
}
