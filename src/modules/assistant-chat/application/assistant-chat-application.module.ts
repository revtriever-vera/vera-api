import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ContextModule } from '../../../core/context/context.module';
import { LlmModule } from '../../../core/llm/llm.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { QueueModule } from '../../../core/queue/queue.module';
import { UsageModule } from '../../../core/usage/usage.module';
import { AiAssistantApplicationModule } from '../../ai-assistant/application/ai-assistant-application.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { PlansApplicationModule } from '../../plans/application/plans-application.module';
import { AssistantChatDomainModule } from '../domain/assistant-chat-domain.module';
import { AssistantActionRegistry } from '../services/assistant-action.registry';
import { AssistantActionService } from '../services/assistant-action.service';
import { AssistantAccessService } from '../services/assistant-access.service';
import { AssistantChatLogService } from '../services/assistant-chat-log.service';
import { AssistantChatMetricsService } from '../services/assistant-chat-metrics.service';
import { AssistantChatEraser } from '../services/assistant-chat.eraser';
import { AssistantChatExporter } from '../services/assistant-chat.exporter';
import { AssistantChatMemberLifecycle } from '../services/assistant-chat.member-lifecycle';
import { AssistantSentPurge } from '../services/assistant-sent.purge';
import { AssistantTurnExpiry } from '../services/assistant-turn.expiry';
import { AssistantAnswerApplication } from './assistant-answer.application';
import { AssistantConversationApplication } from './assistant-conversation.application';
import { AssistantTurnApplication } from './assistant-turn.application';

@Module({
    imports: [
        AssistantChatDomainModule,
        AiAssistantApplicationModule,
        PlansApplicationModule,
        IdentityApplicationModule,
        DiscoveryModule,
        LlmModule,
        UsageModule,
        QueueModule,
        ContextModule,
        ObservabilityModule
    ],
    providers: [
        AssistantTurnApplication,
        AssistantConversationApplication,
        AssistantAnswerApplication,
        AssistantActionService,
        AssistantActionRegistry,
        AssistantAccessService,
        AssistantTurnExpiry,
        AssistantChatLogService,
        AssistantChatMetricsService,
        AssistantChatExporter,
        AssistantChatEraser,
        AssistantChatMemberLifecycle,
        AssistantSentPurge
    ],
    exports: [AssistantTurnApplication, AssistantConversationApplication, AssistantAnswerApplication]
})
export class AssistantChatApplicationModule {}
