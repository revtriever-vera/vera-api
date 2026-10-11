import { Injectable } from '@nestjs/common';
import { PortfolioSnapshot, PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { ContributionTargetsNotSetError } from '../domain/contribution.errors';
import { ClassSuggestion, ContributionSuggestion } from '../domain/contribution.types';
import { buildSuggestion } from '../domain/suggestion-builder';
import { ContributionLogService } from '../services/contribution-log.service';
import { ContributionMetricsService } from '../services/contribution-metrics.service';
import { SuggestResponse } from '../validation/contribution.schemas';

@Injectable()
export class ContributionSuggestionApplication {
    public constructor(
        private readonly snapshots: PortfolioSnapshotService,
        private readonly logs: ContributionLogService,
        private readonly metrics: ContributionMetricsService
    ) {}

    public async suggest(amountMinor: number): Promise<SuggestResponse> {
        const snapshot: PortfolioSnapshot = await this.snapshots.build();
        const suggestion: ContributionSuggestion = this.compute(snapshot, amountMinor);
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
