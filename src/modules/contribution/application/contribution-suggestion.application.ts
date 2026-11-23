import { Injectable } from '@nestjs/common';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { GoalsReaderService } from '../../goals/services/goals-reader.service';
import { PortfolioSnapshot, PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { ContributionTargetsNotSetError } from '../domain/contribution.errors';
import { ClassSuggestion, ContributionSuggestion, PrioritizedSuggestion } from '../domain/contribution.types';
import { allocateGoals, GoalAllocation, GoalWish } from '../domain/goal-allocation';
import { buildSuggestion } from '../domain/suggestion-builder';
import { ContributionLogService } from '../services/contribution-log.service';
import { ContributionMetricsService } from '../services/contribution-metrics.service';
import { SuggestResponse } from '../validation/contribution.schemas';

@Injectable()
export class ContributionSuggestionApplication {
    public constructor(
        private readonly snapshots: PortfolioSnapshotService,
        private readonly goals: GoalsReaderService,
        private readonly logs: ContributionLogService,
        private readonly metrics: ContributionMetricsService
    ) {}

    public async suggest(amountMinor: number, prioritizeGoals: boolean = true): Promise<SuggestResponse> {
        const snapshot: PortfolioSnapshot = await this.snapshots.build(ANY_HOLDER);
        const wishes: GoalWish[] = prioritizeGoals && snapshot.baseCurrency === 'BRL' ? await this.goals.priorities(snapshot) : [];
        const allocation: GoalAllocation = allocateGoals(snapshot, wishes, amountMinor);
        const built: ContributionSuggestion = this.compute(allocation.snapshot, amountMinor - allocation.goalsAmountMinor);
        const suggestion: PrioritizedSuggestion = {
            ...built,
            amountMinor,
            totalBeforeMinor: snapshot.totalMinor,
            goalsAmountMinor: allocation.goalsAmountMinor,
            goals: allocation.goals
        };
        this.metrics.suggestion('ok');
        this.logs.suggested({
            classesFunded: suggestion.classes.length,
            assetsFunded: suggestion.classes.reduce((sum: number, item: ClassSuggestion): number => sum + item.assets.length, 0),
            warnings: suggestion.warnings.length
        });
        return suggestion;
    }

    private compute(snapshot: PortfolioSnapshot, amountMinor: number): ContributionSuggestion {
        try {
            return buildSuggestion(snapshot, amountMinor);
        } catch (error: unknown) {
            if (error instanceof ContributionTargetsNotSetError) {
                this.metrics.suggestion('targets_not_set');
                this.logs.targetsNotSet();
            }
            throw error;
        }
    }
}
