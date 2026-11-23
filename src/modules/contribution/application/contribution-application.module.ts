import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { PortfolioApplicationModule } from '../../portfolio/application/portfolio-application.module';
import { ContributionPlannerService } from '../services/contribution-planner.service';
import { ContributionLogService } from '../services/contribution-log.service';
import { ContributionMetricsService } from '../services/contribution-metrics.service';
import { ContributionSuggestionApplication } from './contribution-suggestion.application';

@Module({
    imports: [ObservabilityModule, PortfolioApplicationModule],
    providers: [ContributionSuggestionApplication, ContributionPlannerService, ContributionLogService, ContributionMetricsService],
    exports: [ContributionSuggestionApplication, ContributionPlannerService]
})
export class ContributionApplicationModule {}
