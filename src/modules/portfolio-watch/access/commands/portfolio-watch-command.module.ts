import { Module } from '@nestjs/common';
import { PortfolioWatchApplicationModule } from '../../application/portfolio-watch-application.module';
import { PortfolioWatchDailyCommand, PortfolioWatchDailyTickHandler } from './portfolio-watch-daily.command';
import { PortfolioWatchMonthlyReviewCommand, PortfolioWatchMonthlyReviewTickHandler } from './portfolio-watch-monthly-review.command';
import { PortfolioWatchMonthlySnapshotCommand, PortfolioWatchMonthlySnapshotTickHandler } from './portfolio-watch-monthly-snapshot.command';
import { PortfolioWatchWeeklyChangesCommand, PortfolioWatchWeeklyChangesTickHandler } from './portfolio-watch-weekly-changes.command';

@Module({
    imports: [PortfolioWatchApplicationModule],
    providers: [
        PortfolioWatchMonthlySnapshotCommand,
        PortfolioWatchMonthlySnapshotTickHandler,
        PortfolioWatchMonthlyReviewCommand,
        PortfolioWatchMonthlyReviewTickHandler,
        PortfolioWatchDailyCommand,
        PortfolioWatchDailyTickHandler,
        PortfolioWatchWeeklyChangesCommand,
        PortfolioWatchWeeklyChangesTickHandler
    ]
})
export class PortfolioWatchCommandModule {}
