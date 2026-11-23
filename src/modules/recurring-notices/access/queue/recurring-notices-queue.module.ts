import { Module } from '@nestjs/common';
import { QueueModule } from '../../../../core/queue/queue.module';
import { RecurringNoticesApplicationModule } from '../../application/recurring-notices-application.module';
import { RecurringDueNoticeHandler, RecurringNoticeScheduleHandler, RecurringWeekNoticeHandler } from './recurring-notice.handlers';

@Module({
    imports: [RecurringNoticesApplicationModule, QueueModule],
    providers: [RecurringNoticeScheduleHandler, RecurringWeekNoticeHandler, RecurringDueNoticeHandler]
})
export class RecurringNoticesQueueModule {}
