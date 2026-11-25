import { Module } from '@nestjs/common';
import { PortfolioWatchCommandModule } from './access/commands/portfolio-watch-command.module';
import { PortfolioWatchQueueModule } from './access/queue/portfolio-watch-queue.module';

@Module({
    imports: [PortfolioWatchCommandModule, PortfolioWatchQueueModule]
})
export class PortfolioWatchModule {}
