import { Module } from '@nestjs/common';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { PortfolioApplicationModule } from '../../portfolio/application/portfolio-application.module';
import { SpendingSummaryApplicationModule } from '../../spending-summary/application/spending-summary-application.module';
import { GoalsDomainModule } from '../domain/goals-domain.module';
import { GoalsReaderService } from '../services/goals-reader.service';
import { GoalsApplication } from './goals.application';

@Module({
    imports: [GoalsDomainModule, PortfolioApplicationModule, IdentityApplicationModule, SpendingSummaryApplicationModule],
    providers: [GoalsApplication, GoalsReaderService],
    exports: [GoalsApplication, GoalsReaderService]
})
export class GoalsApplicationModule {}
