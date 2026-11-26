import { Module } from '@nestjs/common';
import { QueueModule } from '../../../../core/queue/queue.module';
import { PortfolioWatchApplicationModule } from '../../application/portfolio-watch-application.module';
import { PortfolioWatchDailyHandler } from './portfolio-watch-daily.handler';
import { PortfolioWatchSnapshotHandler } from './portfolio-watch-snapshot.handler';
import { PortfolioWatchWeeklyChangesHandler } from './portfolio-watch-weekly-changes.handler';

@Module({
    imports: [PortfolioWatchApplicationModule, QueueModule],
    providers: [PortfolioWatchSnapshotHandler, PortfolioWatchDailyHandler, PortfolioWatchWeeklyChangesHandler]
})
export class PortfolioWatchQueueModule {}
