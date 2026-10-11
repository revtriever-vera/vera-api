import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';

const SUGGESTIONS: string = 'vera_contribution_suggestions_total';

export type SuggestionResult = 'ok' | 'targets_not_set';

@Injectable()
export class ContributionMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public suggestion(result: SuggestionResult): void {
        this.metrics.count(SUGGESTIONS, { result });
    }
}
