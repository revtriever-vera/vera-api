import { Module } from '@nestjs/common';
import { RecurringNoticesCommandModule } from './access/commands/recurring-notices-command.module';
import { RecurringNoticesHttpModule } from './access/http/recurring-notices-http.module';
import { RecurringNoticesQueueModule } from './access/queue/recurring-notices-queue.module';

@Module({
    imports: [RecurringNoticesHttpModule, RecurringNoticesCommandModule, RecurringNoticesQueueModule]
})
export class RecurringNoticesModule {}
