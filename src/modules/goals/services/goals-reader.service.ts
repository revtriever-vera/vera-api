import { Injectable } from '@nestjs/common';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { PortfolioSnapshot, PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { GoalDomain } from '../domain/goal.domain';
import { isNoticeDue } from '../domain/goal-notice-due';
import { Goal, GOAL_STATUSES } from '../domain/goals.types';
import { GoalsList, GoalView } from '../validation/goals.schemas';
import { GoalPriority, prioritiesOf } from './goal-priority';
import { HoldingIndex, indexHoldings, toGoalsList, toGoalView } from './goal-view.mapper';

export interface GoalsNeed {
    readonly monthlyNeededMinor: number;
    readonly behindCount: number;
}

export interface BehindGoal {
    readonly id: string;
    readonly name: string;
    readonly targetMinor: number;
    readonly targetDate: string;
    readonly remainingMinor: number;
    readonly monthlyMinor: number;
    readonly planMonthlyMinor: number;
    readonly overdue: boolean;
}

export interface BehindGoalsDue {
    readonly today: string;
    readonly goals: readonly BehindGoal[];
}

function isBehind(view: GoalView): boolean {
    return view.status === GOAL_STATUSES.behind || view.status === GOAL_STATUSES.overdue;
}

function behindOf(view: GoalView): BehindGoal {
    return {
        id: view.id,
        name: view.name,
        targetMinor: view.targetMinor,
        targetDate: view.targetDate,
        remainingMinor: view.remainingMinor,
        monthlyMinor: view.monthlyMinor,
        planMonthlyMinor: view.planMonthlyMinor,
        overdue: view.status === GOAL_STATUSES.overdue
    };
}

@Injectable()
export class GoalsReaderService {
    public constructor(
        private readonly goals: GoalDomain,
        private readonly snapshots: PortfolioSnapshotService,
        private readonly timezones: CompanyTimezoneService
    ) {}

    public async need(): Promise<GoalsNeed> {
        const goals: Goal[] = await this.goals.list(ANY_HOLDER);
        if (goals.length === 0) {
            return { monthlyNeededMinor: 0, behindCount: 0 };
        }
        const today: string = await this.timezones.todayInCompany();
        const holdings: HoldingIndex = indexHoldings(await this.snapshots.build(ANY_HOLDER));
        const list: GoalsList = toGoalsList(goals.map((goal: Goal) => toGoalView(goal, holdings, today)));
        return { monthlyNeededMinor: list.totals.monthlyNeededMinor, behindCount: list.totals.behindCount };
    }

    public async priorities(snapshot: PortfolioSnapshot): Promise<GoalPriority[]> {
        const goals: Goal[] = await this.goals.list(ANY_HOLDER);
        if (goals.length === 0) {
            return [];
        }
        return prioritiesOf(goals, snapshot, await this.timezones.todayInCompany());
    }

    public async companyIdsDue(today: string): Promise<string[]> {
        return this.goals.companyIdsDueAcrossTenants(today);
    }

    public async behindDue(): Promise<BehindGoalsDue> {
        const today: string = await this.timezones.todayInCompany();
        const due: Goal[] = (await this.goals.listReal()).filter((goal: Goal): boolean => isNoticeDue(today, goal.targetDate));
        if (due.length === 0) {
            return { today, goals: [] };
        }
        const holdings: HoldingIndex = indexHoldings(await this.snapshots.build(ANY_HOLDER));
        const views: GoalView[] = due.map((goal: Goal): GoalView => toGoalView(goal, holdings, today));
        return { today, goals: views.filter(isBehind).map(behindOf) };
    }

    public async overview(): Promise<GoalView[]> {
        const goals: Goal[] = await this.goals.list(ANY_HOLDER);
        if (goals.length === 0) {
            return [];
        }
        const today: string = await this.timezones.todayInCompany();
        const holdings: HoldingIndex = indexHoldings(await this.snapshots.build(ANY_HOLDER));
        return goals.map((goal: Goal): GoalView => toGoalView(goal, holdings, today));
    }
}
