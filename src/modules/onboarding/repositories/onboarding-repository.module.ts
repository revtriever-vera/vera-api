import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { OnboardingStatesRepository } from './onboarding-states.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [OnboardingStatesRepository],
    exports: [OnboardingStatesRepository]
})
export class OnboardingRepositoryModule {}
