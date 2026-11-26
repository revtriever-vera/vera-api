import { Module } from '@nestjs/common';
import { PortfolioWatchApplicationModule } from '../../application/portfolio-watch-application.module';
import { PortfolioWatchDailyCommand, PortfolioWatchDailyTickHandler } from './portfolio-watch-daily.command';
import { PortfolioWatchMonthlySnapshotCommand, PortfolioWatchMonthlySnapshotTickHandler } from './portfolio-watch-monthly-snapshot.command';

@Module({
    imports: [PortfolioWatchApplicationModule],
    providers: [
        PortfolioWatchMonthlySnapshotCommand,
        PortfolioWatchMonthlySnapshotTickHandler,
        PortfolioWatchDailyCommand,
        PortfolioWatchDailyTickHandler
    ]
})
export class PortfolioWatchCommandModule {}
