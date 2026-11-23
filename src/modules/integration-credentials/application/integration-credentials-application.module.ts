import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { ContextModule } from '../../../core/context/context.module';
import { CryptoModule } from '../../../core/crypto/crypto.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { PlansApplicationModule } from '../../plans/application/plans-application.module';
import { integrationCredentialsConfig } from '../config/integration-credentials.config';
import { IntegrationCredentialsDomainModule } from '../domain/integration-credentials-domain.module';
import { InstanceCredentialsService } from '../services/instance-credentials.service';
import { IntegrationAccountEraser } from '../services/integration-account.eraser';
import { IntegrationCredentialsResealer } from '../services/integration-credentials.resealer';
import { IntegrationCredentialsService } from '../services/integration-credentials.service';
import { IntegrationRemovedRegistry } from '../services/integration-removed.registry';
import { IntegrationVaultService } from '../services/integration-vault.service';
import { IntegrationsLogService } from '../services/integrations-log.service';
import { IntegrationsMetricsService } from '../services/integrations-metrics.service';
import { IntegrationTesterService } from '../services/integration-tester.service';
import { LlmTester } from '../services/testers/llm.tester';
import { WhatsAppTester } from '../services/testers/whatsapp.tester';
import { IntegrationsApplication } from './integrations.application';

@Module({
    imports: [
        ConfigModule.forFeature(integrationCredentialsConfig),
        DiscoveryModule,
        IntegrationCredentialsDomainModule,
        PlansApplicationModule,
        CryptoModule,
        ContextModule,
        ObservabilityModule
    ],
    providers: [
        IntegrationsApplication,
        IntegrationCredentialsService,
        IntegrationVaultService,
        InstanceCredentialsService,
        IntegrationRemovedRegistry,
        IntegrationAccountEraser,
        IntegrationCredentialsResealer,
        IntegrationsLogService,
        IntegrationsMetricsService,
        IntegrationTesterService,
        LlmTester,
        WhatsAppTester
    ],
    exports: [IntegrationsApplication, IntegrationCredentialsService]
})
export class IntegrationCredentialsApplicationModule {}
