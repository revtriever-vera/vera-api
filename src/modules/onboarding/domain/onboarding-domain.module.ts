import { Module } from '@nestjs/common';
import { OnboardingRepositoryModule } from '../repositories/onboarding-repository.module';
import { OnboardingStateDomain } from './onboarding-state.domain';

@Module({
    imports: [OnboardingRepositoryModule],
    providers: [OnboardingStateDomain],
    exports: [OnboardingStateDomain]
})
export class OnboardingDomainModule {}
