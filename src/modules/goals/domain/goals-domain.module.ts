import { Module } from '@nestjs/common';
import { GoalsRepositoryModule } from '../repositories/goals-repository.module';
import { GoalDomain } from './goal.domain';

@Module({
    imports: [GoalsRepositoryModule],
    providers: [GoalDomain],
    exports: [GoalDomain]
})
export class GoalsDomainModule {}
