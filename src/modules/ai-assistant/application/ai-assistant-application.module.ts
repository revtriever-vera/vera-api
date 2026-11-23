import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ContextModule } from '../../../core/context/context.module';
import { LlmModule } from '../../../core/llm/llm.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { ContributionApplicationModule } from '../../contribution/application/contribution-application.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { PlansApplicationModule } from '../../plans/application/plans-application.module';
import { PortfolioApplicationModule } from '../../portfolio/application/portfolio-application.module';
import { SpendingCutsApplicationModule } from '../../spending-cuts/application/spending-cuts-application.module';
import { SpendingSummaryApplicationModule } from '../../spending-summary/application/spending-summary-application.module';
import { AiAssistantDomainModule } from '../domain/ai-assistant-domain.module';
import { AiTextRenderer } from '../domain/context/ai-text-renderer';
import { AiAssistantLogService } from '../services/ai-assistant-log.service';
import { AiAssistantMetricsService } from '../services/ai-assistant-metrics.service';
import { AiConsentEraser } from '../services/ai-consent.eraser';
import { AiConsentExporter } from '../services/ai-consent.exporter';
import { AiConsentGuard } from '../services/ai-consent.guard';
import { AiConsentService } from '../services/ai-consent.service';
import { AiContextBuilderService } from '../services/ai-context-builder.service';
import { AiDataPurgeRegistry } from '../services/ai-data-purge.registry';
import { AiFeatureAvailability } from '../services/ai-feature-availability';
import { AiConsentApplication } from './ai-consent.application';
import { AiPayloadApplication } from './ai-payload.application';

@Module({
    imports: [
        AiAssistantDomainModule,
        ContextModule,
        DiscoveryModule,
        ObservabilityModule,
        LlmModule,
        PlansApplicationModule,
        IdentityApplicationModule,
        SpendingSummaryApplicationModule,
        SpendingCutsApplicationModule,
        PortfolioApplicationModule,
        ContributionApplicationModule
    ],
    providers: [
        AiConsentApplication,
        AiPayloadApplication,
        AiConsentService,
        AiConsentGuard,
        AiContextBuilderService,
        AiTextRenderer,
        AiDataPurgeRegistry,
        AiFeatureAvailability,
        AiConsentEraser,
        AiConsentExporter,
        AiAssistantLogService,
        AiAssistantMetricsService
    ],
    exports: [AiConsentApplication, AiPayloadApplication, AiConsentService, AiConsentGuard, AiContextBuilderService, AiTextRenderer]
})
export class AiAssistantApplicationModule {}
