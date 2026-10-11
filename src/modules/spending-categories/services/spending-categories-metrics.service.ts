import { Injectable } from '@nestjs/common';
import { MetricsService } from '../../../core/observability/metrics.service';
import { CategorizationSource, RuleAction, RuleMatchType } from '../domain/categories.types';

const CATEGORIZATION_TOTAL: string = 'vera_categorization_total';
const RULES_TOTAL: string = 'vera_spending_rules_total';

@Injectable()
export class SpendingCategoriesMetricsService {
    public constructor(private readonly metrics: MetricsService) {}

    public categorized(source: CategorizationSource, amount: number): void {
        this.metrics.count(CATEGORIZATION_TOTAL, { source }, amount);
    }

    public ruleAction(action: RuleAction, matchType: RuleMatchType): void {
        this.metrics.count(RULES_TOTAL, { action, matchType });
    }
}
