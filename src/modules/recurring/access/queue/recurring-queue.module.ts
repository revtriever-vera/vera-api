import { Module } from '@nestjs/common';
import { QueueModule } from '../../../../core/queue/queue.module';
import { RecurringApplicationModule } from '../../application/recurring-application.module';
import { RecurringDetectHandler } from './recurring-detect.handler';

@Module({
    imports: [RecurringApplicationModule, QueueModule],
    providers: [RecurringDetectHandler]
})
export class RecurringQueueModule {}
