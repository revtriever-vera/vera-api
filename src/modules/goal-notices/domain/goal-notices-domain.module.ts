import { Module } from '@nestjs/common';
import { GoalNoticesRepositoryModule } from '../repositories/goal-notices-repository.module';
import { GoalNoticeMarkDomain } from './goal-notice-mark.domain';

@Module({
    imports: [GoalNoticesRepositoryModule],
    providers: [GoalNoticeMarkDomain],
    exports: [GoalNoticeMarkDomain]
})
export class GoalNoticesDomainModule {}
