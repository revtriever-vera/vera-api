import { Module } from '@nestjs/common';
import { PortfolioEventsCommandModule } from './access/commands/portfolio-events-command.module';
import { PortfolioEventsQueueModule } from './access/queue/portfolio-events-queue.module';

@Module({
    imports: [PortfolioEventsCommandModule, PortfolioEventsQueueModule]
})
export class PortfolioEventsModule {}
