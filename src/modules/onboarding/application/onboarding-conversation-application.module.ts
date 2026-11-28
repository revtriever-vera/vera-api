import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { AssistantChatApplicationModule } from '../../assistant-chat/application/assistant-chat-application.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { OnboardingDomainModule } from '../domain/onboarding-domain.module';
import { OnboardingLogService } from '../services/onboarding-log.service';
import { OnboardingConversationApplication } from './onboarding-conversation.application';

@Module({
    imports: [OnboardingDomainModule, AssistantChatApplicationModule, IdentityApplicationModule, ObservabilityModule],
    providers: [OnboardingLogService, OnboardingConversationApplication],
    exports: [OnboardingConversationApplication]
})
export class OnboardingConversationApplicationModule {}
