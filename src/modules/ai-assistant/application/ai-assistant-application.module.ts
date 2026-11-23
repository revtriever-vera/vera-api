import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ContextModule } from '../../../core/context/context.module';
import { LlmModule } from '../../../core/llm/llm.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { UsageModule } from '../../../core/usage/usage.module';
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
import { AiSummariesEraser } from '../services/ai-summaries.eraser';
import { AiSummariesExporter } from '../services/ai-summaries.exporter';
import { AiSummariesPurge } from '../services/ai-summaries.purge';
import { SummaryGeneratorService } from '../services/summary-generator.service';
import { SummarySubjectService } from '../services/summary-subject.service';
import { AiConsentApplication } from './ai-consent.application';
import { AiPayloadApplication } from './ai-payload.application';
import { SummariesApplication } from './summaries.application';

@Module({
    imports: [
        AiAssistantDomainModule,
        ContextModule,
        DiscoveryModule,
        ObservabilityModule,
        LlmModule,
        UsageModule,
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
        SummariesApplication,
        SummaryGeneratorService,
        SummarySubjectService,
        AiSummariesPurge,
        AiSummariesEraser,
        AiSummariesExporter,
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
    exports: [
        AiConsentApplication,
        AiPayloadApplication,
        SummariesApplication,
        AiConsentService,
        AiConsentGuard,
        AiContextBuilderService,
        AiTextRenderer
    ]
})
export class AiAssistantApplicationModule {}
