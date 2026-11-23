import { Injectable } from '@nestjs/common';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { GoalDomain } from '../domain/goal.domain';
import { Goal } from '../domain/goals.types';
import { GoalsList } from '../validation/goals.schemas';
import { HoldingIndex, indexHoldings, toGoalsList, toGoalView } from './goal-view.mapper';

export interface GoalsNeed {
    readonly monthlyNeededMinor: number;
    readonly behindCount: number;
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
}
