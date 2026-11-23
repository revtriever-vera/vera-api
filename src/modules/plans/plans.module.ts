import { Module } from '@nestjs/common';
import { PlansCommandModule } from './access/commands/plans-command.module';
import { PlansHttpModule } from './access/http/plans-http.module';
import { PlansQueueModule } from './access/queue/plans-queue.module';

@Module({
    imports: [PlansHttpModule, PlansCommandModule, PlansQueueModule]
})
export class PlansModule {}
