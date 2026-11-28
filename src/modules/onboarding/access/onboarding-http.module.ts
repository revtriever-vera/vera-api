import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { OnboardingApplicationModule } from '../application/onboarding-application.module';
import { OnboardingConversationApplicationModule } from '../application/onboarding-conversation-application.module';
import { OnboardingConversationController } from './onboarding-conversation.controller';
import { OnboardingSampleController } from './onboarding-sample.controller';
import { OnboardingController } from './onboarding.controller';

@Module({
    imports: [OnboardingApplicationModule, OnboardingConversationApplicationModule, IdentityApplicationModule, ContextModule],
    controllers: [OnboardingController, OnboardingSampleController, OnboardingConversationController]
})
export class OnboardingHttpModule {}
