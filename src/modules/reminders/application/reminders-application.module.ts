import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { ContextModule } from '../../../core/context/context.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { QueueModule } from '../../../core/queue/queue.module';
import { UsageModule } from '../../../core/usage/usage.module';
import { AiAssistantApplicationModule } from '../../ai-assistant/application/ai-assistant-application.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { PlansApplicationModule } from '../../plans/application/plans-application.module';
import { WhatsAppApplicationModule } from '../../whatsapp/application/whatsapp-application.module';
import { WhatsAppLinkApplicationModule } from '../../whatsapp-link/application/whatsapp-link-application.module';
import { remindersConfig } from '../config/reminders.config';
import { RemindersDomainModule } from '../domain/reminders-domain.module';
import { ReminderCancellationAdapter } from '../services/reminder-cancellation.adapter';
import { ReminderCommandsService } from '../services/reminder-commands.service';
import { ReminderDeliveryService } from '../services/reminder-delivery.service';
import { ReminderEngineService } from '../services/reminder-engine.service';
import { ReminderCreateExecutor, ReminderDeleteExecutor } from '../services/reminder-pending-actions';
import { ReminderCancelTool, ReminderCreateTool, ReminderListTool } from '../services/reminder-ask-vera.tools';
import { RemindersAccountEraser } from '../services/reminders-account.eraser';
import { RemindersAccountSpreadsheet } from '../services/reminders-account.exporter';
import { RemindersLogService } from '../services/reminders-log.service';
import { RemindersMemberLifecycle } from '../services/reminders-member.lifecycle';
import { RemindersMetricsService } from '../services/reminders-metrics.service';
import { RemindersPremiumLifecycle } from '../services/reminders-premium.lifecycle';
import { ReminderFireApplication } from './reminder-fire.application';
import { ReminderMaintenanceApplication } from './reminder-maintenance.application';
import { RemindersApplication } from './reminders.application';

@Module({
    imports: [
        ConfigModule.forFeature(remindersConfig),
        DiscoveryModule,
        RemindersDomainModule,
        WhatsAppApplicationModule,
        WhatsAppLinkApplicationModule,
        AiAssistantApplicationModule,
        IdentityApplicationModule,
        PlansApplicationModule,
        UsageModule,
        QueueModule,
        ContextModule,
        ObservabilityModule
    ],
    providers: [
        RemindersApplication,
        ReminderFireApplication,
        ReminderMaintenanceApplication,
        ReminderEngineService,
        ReminderDeliveryService,
        ReminderCommandsService,
        ReminderCreateExecutor,
        ReminderDeleteExecutor,
        ReminderCreateTool,
        ReminderListTool,
        ReminderCancelTool,
        ReminderCancellationAdapter,
        RemindersPremiumLifecycle,
        RemindersMemberLifecycle,
        RemindersAccountEraser,
        RemindersAccountSpreadsheet,
        RemindersLogService,
        RemindersMetricsService
    ],
    exports: [RemindersApplication, ReminderFireApplication, ReminderMaintenanceApplication]
})
export class RemindersApplicationModule {}
