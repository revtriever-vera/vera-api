import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { GoalHoldingsRepository } from './goal-holdings.repository';
import { GoalsRepository } from './goals.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [GoalsRepository, GoalHoldingsRepository],
    exports: [GoalsRepository, GoalHoldingsRepository]
})
export class GoalsRepositoryModule {}
