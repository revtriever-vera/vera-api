import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { PortfolioApplicationModule } from '../../portfolio/application/portfolio-application.module';
import { SpendingSummaryApplicationModule } from '../../spending-summary/application/spending-summary-application.module';
import { GoalsDomainModule } from '../domain/goals-domain.module';
import { GoalAssistantService } from '../services/goal-assistant.service';
import { GoalCreateExecutor, GoalCreateTool } from '../services/goal-assistant.tools';
import { GoalCreationService } from '../services/goal-creation.service';
import { GoalRulesService } from '../services/goal-rules.service';
import { GoalsAccountExporter } from '../services/goals-account.exporter';
import { GoalsAccountSpreadsheet } from '../services/goals-account.spreadsheet';
import { GoalsHolderDepartureHandler } from '../services/goals-holder-departure.handler';
import { GoalsSampleDataService } from '../services/goals-sample-data.service';
import { GoalsOverviewTool } from '../services/goals-overview.tool';
import { GoalsReaderService } from '../services/goals-reader.service';
import { GoalsApplication } from './goals.application';

@Module({
    imports: [ContextModule, GoalsDomainModule, PortfolioApplicationModule, IdentityApplicationModule, SpendingSummaryApplicationModule],
    providers: [
        GoalsApplication,
        GoalRulesService,
        GoalCreationService,
        GoalAssistantService,
        GoalCreateTool,
        GoalCreateExecutor,
        GoalsReaderService,
        GoalsOverviewTool,
        GoalsAccountExporter,
        GoalsAccountSpreadsheet,
        GoalsHolderDepartureHandler,
        GoalsSampleDataService
    ],
    exports: [GoalsApplication, GoalsReaderService]
})
export class GoalsApplicationModule {}
