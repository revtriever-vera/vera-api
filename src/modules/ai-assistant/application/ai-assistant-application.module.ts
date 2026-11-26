import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ContextModule } from '../../../core/context/context.module';
import { LlmModule } from '../../../core/llm/llm.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { UsageModule } from '../../../core/usage/usage.module';
import { ConcentrationApplicationModule } from '../../concentration/application/concentration-application.module';
import { ContributionApplicationModule } from '../../contribution/application/contribution-application.module';
import { FixedIncomeScheduleApplicationModule } from '../../fixed-income-schedule/application/fixed-income-schedule-application.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { MarketBenchmarksApplicationModule } from '../../market-benchmarks/application/market-benchmarks-application.module';
import { PlansApplicationModule } from '../../plans/application/plans-application.module';
import { PortfolioApplicationModule } from '../../portfolio/application/portfolio-application.module';
import { SpendingCategoriesApplicationModule } from '../../spending-categories/application/spending-categories-application.module';
import { SpendingCutsApplicationModule } from '../../spending-cuts/application/spending-cuts-application.module';
import { SpendingSummaryApplicationModule } from '../../spending-summary/application/spending-summary-application.module';
import { TransactionsApplicationModule } from '../../transactions/application/transactions-application.module';
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
import { AskVeraAccessService } from '../services/ask-vera-access.service';
import { AskVeraTelemetryService } from '../services/ask-vera-telemetry.service';
import { AskVeraToolRegistry } from '../services/ask-vera-tool.registry';
import { AskVeraService } from '../services/ask-vera.service';
import { ConcentrationOverviewTool } from '../services/tools/concentration-overview.tool';
import { ContributionSuggestionTool } from '../services/tools/contribution-suggestion.tool';
import { FixedIncomeMaturitiesTool } from '../services/tools/fixed-income-maturities.tool';
import { AssetLookupTool } from '../services/tools/asset-lookup.tool';
import { DataLockedTool } from '../services/tools/data-locked.tool';
import { FixedIncomeVsBenchmarkTool } from '../services/tools/fixed-income-vs-benchmark.tool';
import { FundPerformanceTool } from '../services/tools/fund-performance.tool';
import { HelpSearchTool } from '../services/tools/help-search.tool';
import { ListCategoriesTool } from '../services/tools/list-categories.tool';
import { MarketBenchmarksTool } from '../services/tools/market-benchmarks.tool';
import { PortfolioOverviewTool } from '../services/tools/portfolio-overview.tool';
import { SpendingByCategoryTool } from '../services/tools/spending-by-category.tool';
import { SpendingCutsTool } from '../services/tools/spending-cuts.tool';
import { SpendingMonthSummaryTool } from '../services/tools/spending-month-summary.tool';
import { WhereIsTool } from '../services/tools/where-is.tool';
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
        ContributionApplicationModule,
        ConcentrationApplicationModule,
        FixedIncomeScheduleApplicationModule,
        MarketBenchmarksApplicationModule,
        SpendingCategoriesApplicationModule,
        TransactionsApplicationModule
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
        AiAssistantMetricsService,
        AskVeraService,
        AskVeraAccessService,
        AskVeraTelemetryService,
        AskVeraToolRegistry,
        SpendingMonthSummaryTool,
        SpendingCutsTool,
        SpendingByCategoryTool,
        PortfolioOverviewTool,
        ContributionSuggestionTool,
        ConcentrationOverviewTool,
        FixedIncomeMaturitiesTool,
        MarketBenchmarksTool,
        AssetLookupTool,
        FundPerformanceTool,
        FixedIncomeVsBenchmarkTool,
        ListCategoriesTool,
        HelpSearchTool,
        WhereIsTool,
        DataLockedTool
    ],
    exports: [
        AiConsentApplication,
        AiPayloadApplication,
        SummariesApplication,
        AiConsentService,
        AiConsentGuard,
        AiContextBuilderService,
        AiTextRenderer,
        AskVeraService
    ]
})
export class AiAssistantApplicationModule {}
