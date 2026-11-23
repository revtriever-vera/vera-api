import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { ContextModule } from '../../../core/context/context.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { QueueModule } from '../../../core/queue/queue.module';
import { IntegrationCredentialsApplicationModule } from '../../integration-credentials/application/integration-credentials-application.module';
import { PlansApplicationModule } from '../../plans/application/plans-application.module';
import { whatsappConfig } from '../config/whatsapp.config';
import { WhatsAppDomainModule } from '../domain/whatsapp-domain.module';
import { CloudWhatsAppDriver } from '../drivers/cloud-whatsapp.driver';
import { MockWhatsAppDriver } from '../drivers/mock-whatsapp.driver';
import { ObservedWhatsApp } from '../drivers/observed-whatsapp';
import { WhatsAppCloudPort } from '../ports/whatsapp-cloud.port';
import { InboundDispatchRegistry } from '../services/inbound-dispatch.registry';
import { MockOutbox } from '../services/mock-outbox.service';
import { SignatureVerifier } from '../services/signature.verifier';
import { WebhookBodyService } from '../services/webhook-body.service';
import { WhatsAppAccountEraser } from '../services/whatsapp-account.eraser';
import { WhatsAppAccountExporter } from '../services/whatsapp-account.exporter';
import { WhatsAppConversationEraser } from '../services/whatsapp-conversation-eraser.service';
import { WhatsAppDirectReply } from '../services/whatsapp-direct-reply.service';
import { WhatsAppDisplayNumber } from '../services/whatsapp-display-number.service';
import { WhatsAppAvailability } from '../services/whatsapp-availability';
import { WhatsAppChannelService } from '../services/whatsapp-channel.service';
import { WhatsAppEventProcessor } from '../services/whatsapp-event-processor.service';
import { WhatsAppHousekeepingService } from '../services/whatsapp-housekeeping.service';
import { WhatsAppInboundRecorder } from '../services/whatsapp-inbound-recorder.service';
import { WhatsAppLogService } from '../services/whatsapp-log.service';
import { WhatsAppMetricsService } from '../services/whatsapp-metrics.service';
import { WhatsAppOutboundService } from '../services/whatsapp-outbound.service';
import { WhatsAppWindowService } from '../services/whatsapp-window.service';
import { ChannelMaintenanceApplication } from './channel-maintenance.application';
import { SendApplication } from './send.application';
import { WebhookApplication } from './webhook.application';

@Module({
    imports: [
        ConfigModule.forFeature(whatsappConfig),
        DiscoveryModule,
        WhatsAppDomainModule,
        IntegrationCredentialsApplicationModule,
        PlansApplicationModule,
        ContextModule,
        QueueModule,
        ObservabilityModule
    ],
    providers: [
        WebhookApplication,
        SendApplication,
        ChannelMaintenanceApplication,
        WhatsAppChannelService,
        WhatsAppOutboundService,
        WhatsAppWindowService,
        WhatsAppAvailability,
        WhatsAppAccountExporter,
        WhatsAppAccountEraser,
        WhatsAppEventProcessor,
        WhatsAppInboundRecorder,
        WhatsAppConversationEraser,
        WhatsAppDirectReply,
        WhatsAppDisplayNumber,
        InboundDispatchRegistry,
        WhatsAppHousekeepingService,
        SignatureVerifier,
        WebhookBodyService,
        WhatsAppLogService,
        WhatsAppMetricsService,
        MockOutbox,
        CloudWhatsAppDriver,
        MockWhatsAppDriver,
        {
            provide: WhatsAppCloudPort,
            inject: [whatsappConfig.KEY, CloudWhatsAppDriver, MockWhatsAppDriver, WhatsAppLogService, WhatsAppMetricsService],
            useFactory: (
                config: ConfigType<typeof whatsappConfig>,
                cloud: CloudWhatsAppDriver,
                mock: MockWhatsAppDriver,
                logs: WhatsAppLogService,
                metrics: WhatsAppMetricsService
            ): WhatsAppCloudPort => new ObservedWhatsApp(config.WHATSAPP_DRIVER === 'mock' ? mock : cloud, logs, metrics)
        }
    ],
    exports: [
        WebhookApplication,
        SendApplication,
        ChannelMaintenanceApplication,
        WhatsAppOutboundService,
        WhatsAppChannelService,
        WhatsAppWindowService,
        WhatsAppInboundRecorder,
        WhatsAppConversationEraser,
        WhatsAppDirectReply,
        WhatsAppDisplayNumber
    ]
})
export class WhatsAppApplicationModule {}
