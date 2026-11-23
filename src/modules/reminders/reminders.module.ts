import { Module } from '@nestjs/common';
import { RemindersCommandModule } from './access/commands/reminders-command.module';
import { RemindersHttpModule } from './access/http/reminders-http.module';
import { RemindersQueueModule } from './access/queue/reminders-queue.module';

@Module({
    imports: [RemindersHttpModule, RemindersCommandModule, RemindersQueueModule]
})
export class RemindersModule {}
