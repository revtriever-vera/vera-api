import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { GoalNoticeMarksRepository } from './goal-notice-marks.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [GoalNoticeMarksRepository],
    exports: [GoalNoticeMarksRepository]
})
export class GoalNoticesRepositoryModule {}
