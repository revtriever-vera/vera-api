import { Injectable } from '@nestjs/common';
import { calculateCuts } from '../domain/cuts-calculator';
import { objectivesOf } from '../domain/objectives-need';
import { CutsResponse, CutsResult } from '../domain/spending-cuts.types';
import { GoalsNeed, GoalsReaderService } from '../../goals/services/goals-reader.service';
import { MonthlySummary, SpendingSummaryService } from '../../spending-summary/services/spending-summary.service';
import { SpendingCutsLogService } from '../services/spending-cuts-log.service';
import { SpendingCutsMetricsService } from '../services/spending-cuts-metrics.service';

@Injectable()
export class CutsApplication {
    public constructor(
        private readonly summaries: SpendingSummaryService,
        private readonly goals: GoalsReaderService,
        private readonly logs: SpendingCutsLogService,
        private readonly metrics: SpendingCutsMetricsService
    ) {}

    public async get(month: string | undefined, goalBps: number | undefined): Promise<CutsResponse> {
        const summary: MonthlySummary = await this.summaries.build(month ?? null);
        const result: CutsResult = calculateCuts(summary, goalBps);
        this.metrics.cuts(result.status);
        this.logs.cutsBuilt(result.month, result.status, result.categoriesWithCut, result.goal.simulated);
        const need: GoalsNeed = await this.goals.need();
        return { ...result, objectives: objectivesOf(need.monthlyNeededMinor, need.behindCount, summary.income.minor) };
    }
}
