import { Module } from '@nestjs/common';
import { GoalNoticesApplicationModule } from '../../application/goal-notices-application.module';
import { GoalNoticesDailyCommand, GoalNoticesDailyTickHandler } from './goal-notices-daily.command';

@Module({
    imports: [GoalNoticesApplicationModule],
    providers: [GoalNoticesDailyCommand, GoalNoticesDailyTickHandler]
})
export class GoalNoticesCommandModule {}
