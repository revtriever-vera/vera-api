import { Module } from '@nestjs/common';
import { QueueModule } from '../../../../core/queue/queue.module';
import { GoalNoticesApplicationModule } from '../../application/goal-notices-application.module';
import { GoalNoticesEvaluateHandler } from './goal-notices-evaluate.handler';

@Module({
    imports: [GoalNoticesApplicationModule, QueueModule],
    providers: [GoalNoticesEvaluateHandler]
})
export class GoalNoticesQueueModule {}
