import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { OnboardingApplicationModule } from '../application/onboarding-application.module';
import { OnboardingSampleController } from './onboarding-sample.controller';
import { OnboardingController } from './onboarding.controller';

@Module({
    imports: [OnboardingApplicationModule, IdentityApplicationModule, ContextModule],
    controllers: [OnboardingController, OnboardingSampleController]
})
export class OnboardingHttpModule {}
