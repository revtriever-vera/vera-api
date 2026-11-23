import { Module } from '@nestjs/common';
import { GoalNoticesCommandModule } from './access/commands/goal-notices-command.module';
import { GoalNoticesQueueModule } from './access/queue/goal-notices-queue.module';

@Module({
    imports: [GoalNoticesCommandModule, GoalNoticesQueueModule]
})
export class GoalNoticesModule {}
