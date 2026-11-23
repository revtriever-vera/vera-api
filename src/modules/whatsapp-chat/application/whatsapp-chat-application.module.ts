import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { ContextModule } from '../../../core/context/context.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { QueueModule } from '../../../core/queue/queue.module';
import { ThrottleModule } from '../../../core/throttle/throttle.module';
import { UsageModule } from '../../../core/usage/usage.module';
import { AiAssistantApplicationModule } from '../../ai-assistant/application/ai-assistant-application.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { PlansApplicationModule } from '../../plans/application/plans-application.module';
import { WhatsAppApplicationModule } from '../../whatsapp/application/whatsapp-application.module';
import { WhatsAppLinkApplicationModule } from '../../whatsapp-link/application/whatsapp-link-application.module';
import { whatsappChatConfig } from '../config/whatsapp-chat.config';
import { WhatsAppChatDomainModule } from '../domain/whatsapp-chat-domain.module';
import { ChatAnswerComposer } from '../services/chat-answer.composer';
import { ChatContextRunner } from '../services/chat-context.runner';
import { ChatExtensionsRegistry } from '../services/chat-extensions.registry';
import { ChatFactsService } from '../services/chat-facts.service';
import { ChatInteractionsService } from '../services/chat-interactions.service';
import { ChatIntakeService } from '../services/chat-intake.service';
import { ChatLimitsService } from '../services/chat-limits.service';
import { ChatReplier } from '../services/chat-replier.service';
import { ChatTelemetry } from '../services/chat-telemetry.service';
import { ChatTurnCollector } from '../services/chat-turn.collector';
import { ChatTurnScheduler } from '../services/chat-turn.scheduler';
import { PendingActionService } from '../services/pending-action.service';
import { WhatsAppChatLogService } from '../services/whatsapp-chat-log.service';
import { WhatsAppChatMetricsService } from '../services/whatsapp-chat-metrics.service';
import { AnswerApplication } from './answer.application';
import { ConversationApplication } from './conversation.application';
import { TurnApplication } from './turn.application';

@Module({
    imports: [
        ConfigModule.forFeature(whatsappChatConfig),
        DiscoveryModule,
        WhatsAppChatDomainModule,
        WhatsAppApplicationModule,
        WhatsAppLinkApplicationModule,
        AiAssistantApplicationModule,
        IdentityApplicationModule,
        PlansApplicationModule,
        UsageModule,
        ThrottleModule,
        QueueModule,
        ContextModule,
        ObservabilityModule
    ],
    providers: [
        ConversationApplication,
        TurnApplication,
        AnswerApplication,
        ChatIntakeService,
        ChatReplier,
        ChatFactsService,
        ChatInteractionsService,
        ChatTurnScheduler,
        ChatTurnCollector,
        ChatAnswerComposer,
        ChatContextRunner,
        ChatLimitsService,
        ChatTelemetry,
        PendingActionService,
        ChatExtensionsRegistry,
        WhatsAppChatLogService,
        WhatsAppChatMetricsService
    ],
    exports: [ConversationApplication, TurnApplication, AnswerApplication]
})
export class WhatsAppChatApplicationModule {}
