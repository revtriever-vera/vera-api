import { Module } from '@nestjs/common';
import { PortfolioWatchApplicationModule } from '../../application/portfolio-watch-application.module';
import { PortfolioWatchMonthlySnapshotCommand, PortfolioWatchMonthlySnapshotTickHandler } from './portfolio-watch-monthly-snapshot.command';

@Module({
    imports: [PortfolioWatchApplicationModule],
    providers: [PortfolioWatchMonthlySnapshotCommand, PortfolioWatchMonthlySnapshotTickHandler]
})
export class PortfolioWatchCommandModule {}
