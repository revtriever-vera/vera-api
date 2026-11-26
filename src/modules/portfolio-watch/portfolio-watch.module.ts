import { Module } from '@nestjs/common';
import { PortfolioWatchHttpModule } from './access/http/portfolio-watch-http.module';
import { PortfolioWatchCommandModule } from './access/commands/portfolio-watch-command.module';
import { PortfolioWatchQueueModule } from './access/queue/portfolio-watch-queue.module';

@Module({
    imports: [PortfolioWatchHttpModule, PortfolioWatchCommandModule, PortfolioWatchQueueModule]
})
export class PortfolioWatchModule {}
