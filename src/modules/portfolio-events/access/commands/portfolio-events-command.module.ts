import { Module } from '@nestjs/common';
import { PortfolioEventsApplicationModule } from '../../application/portfolio-events-application.module';
import { IssuerLinksWeeklyCommand, IssuerLinksWeeklyTickHandler } from './issuer-links-weekly.command';
import { PortfolioEventsDailyCommand, PortfolioEventsDailyTickHandler } from './portfolio-events-daily.command';

@Module({
    imports: [PortfolioEventsApplicationModule],
    providers: [PortfolioEventsDailyCommand, PortfolioEventsDailyTickHandler, IssuerLinksWeeklyCommand, IssuerLinksWeeklyTickHandler]
})
export class PortfolioEventsCommandModule {}
