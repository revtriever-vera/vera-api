import { Module } from '@nestjs/common';
import { QueueModule } from '../../../../core/queue/queue.module';
import { PortfolioEventsApplicationModule } from '../../application/portfolio-events-application.module';
import { PortfolioEventsBatchHandler } from './portfolio-events-batch.handler';

@Module({
    imports: [PortfolioEventsApplicationModule, QueueModule],
    providers: [PortfolioEventsBatchHandler]
})
export class PortfolioEventsQueueModule {}
