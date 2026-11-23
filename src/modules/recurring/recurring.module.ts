import { Module } from '@nestjs/common';
import { RecurringCommandModule } from './access/commands/recurring-command.module';
import { RecurringHttpModule } from './access/http/recurring-http.module';
import { RecurringQueueModule } from './access/queue/recurring-queue.module';

@Module({
    imports: [RecurringHttpModule, RecurringCommandModule, RecurringQueueModule]
})
export class RecurringModule {}
