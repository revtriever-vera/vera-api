import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { ContextModule } from '../../../core/context/context.module';
import { CryptoModule } from '../../../core/crypto/crypto.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { ThrottleModule } from '../../../core/throttle/throttle.module';
import { AiAssistantApplicationModule } from '../../ai-assistant/application/ai-assistant-application.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { WhatsAppApplicationModule } from '../../whatsapp/application/whatsapp-application.module';
import { whatsappLinkConfig } from '../config/whatsapp-link.config';
import { WhatsAppLinkDomainModule } from '../domain/whatsapp-link-domain.module';
import { LinkCommandMatcher } from '../services/link-command-matcher.service';
import { LinkBinder } from '../services/link-binder.service';
import { LinkCodeIssuer } from '../services/link-code-issuer.service';
import { LinkContactService } from '../services/link-contact.service';
import { LinkConversationService } from '../services/link-conversation.service';
import { LinkViewService } from '../services/link-view.service';
import { LinkResolverService } from '../services/link-resolver.service';
import { LinkUnlinkService } from '../services/link-unlink.service';
import { PhoneVault } from '../services/phone-vault.service';
import { ReminderCancellationRegistry } from '../services/reminder-cancellation.registry';
import { WhatsAppIntegrationLifecycle } from '../services/whatsapp-integration.lifecycle';
import { WhatsAppLinkAccountEraser } from '../services/whatsapp-link-account.eraser';
import { WhatsAppLinkAccountExporter } from '../services/whatsapp-link-account.exporter';
import { WhatsAppLinkLogService } from '../services/whatsapp-link-log.service';
import { WhatsAppLinkMetricsService } from '../services/whatsapp-link-metrics.service';
import { WhatsAppMemberLifecycle } from '../services/whatsapp-member.lifecycle';
import { WhatsAppPremiumLifecycle } from '../services/whatsapp-premium.lifecycle';
import { LinkCodeApplication } from './link-code.application';
import { LinkInboundApplication } from './link-inbound.application';
import { UnlinkApplication } from './unlink.application';

@Module({
    imports: [
        ConfigModule.forFeature(whatsappLinkConfig),
        DiscoveryModule,
        WhatsAppLinkDomainModule,
        WhatsAppApplicationModule,
        IdentityApplicationModule,
        AiAssistantApplicationModule,
        CryptoModule,
        ThrottleModule,
        ContextModule,
        ObservabilityModule
    ],
    providers: [
        LinkCodeApplication,
        LinkInboundApplication,
        UnlinkApplication,
        LinkResolverService,
        LinkUnlinkService,
        LinkContactService,
        LinkCommandMatcher,
        LinkBinder,
        LinkCodeIssuer,
        LinkConversationService,
        LinkViewService,
        PhoneVault,
        ReminderCancellationRegistry,
        WhatsAppLinkLogService,
        WhatsAppLinkMetricsService,
        WhatsAppPremiumLifecycle,
        WhatsAppMemberLifecycle,
        WhatsAppIntegrationLifecycle,
        WhatsAppLinkAccountEraser,
        WhatsAppLinkAccountExporter
    ],
    exports: [
        LinkCodeApplication,
        LinkInboundApplication,
        UnlinkApplication,
        LinkResolverService,
        LinkUnlinkService,
        LinkContactService,
        LinkCommandMatcher,
        PhoneVault
    ]
})
export class WhatsAppLinkApplicationModule {}
