import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { LlmModule } from '../../../core/llm/llm.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { ThrottleModule } from '../../../core/throttle/throttle.module';
import { CatalogApplicationModule } from '../../catalog/application/catalog-application.module';
import { FixedIncomeApplicationModule } from '../../fixed-income/application/fixed-income-application.module';
import { MarketDataApplicationModule } from '../../market-data/application/market-data-application.module';
import { PositionsApplicationModule } from '../../positions/application/positions-application.module';
import { InvestmentImportDomainModule } from '../domain/investment-import-domain.module';
import { FixedIncomeProposalService } from '../services/fixed-income-proposal.service';
import { ImportLineEvaluatorService } from '../services/import-line-evaluator.service';
import { InvestmentImportAssistantService } from '../services/investment-import-assistant.service';
import { InvestmentImportExecutor } from '../services/investment-import-assistant.executor';
import { InvestmentImportCommitService } from '../services/investment-import-commit.service';
import { InvestmentImportPreviewService } from '../services/investment-import-preview.service';
import { InvestmentImportLogService } from '../services/investment-import-log.service';
import { InvestmentImportMetricsService } from '../services/investment-import-metrics.service';
import { ModelReaderService } from '../services/model-reader.service';
import { NoteAssetResolverService } from '../services/note-asset-resolver.service';
import { StatementReaderService } from '../services/statement-reader.service';
import { InvestmentImportCommitApplication } from './investment-import-commit.application';
import { InvestmentImportListApplication } from './investment-import-list.application';
import { InvestmentImportPreviewApplication } from './investment-import-preview.application';

@Module({
    imports: [
        InvestmentImportDomainModule,
        PositionsApplicationModule,
        CatalogApplicationModule,
        FixedIncomeApplicationModule,
        MarketDataApplicationModule,
        ObservabilityModule,
        ContextModule,
        LlmModule,
        ThrottleModule
    ],
    providers: [
        InvestmentImportPreviewApplication,
        InvestmentImportCommitApplication,
        InvestmentImportListApplication,
        ImportLineEvaluatorService,
        InvestmentImportPreviewService,
        InvestmentImportCommitService,
        InvestmentImportAssistantService,
        InvestmentImportExecutor,
        FixedIncomeProposalService,
        StatementReaderService,
        ModelReaderService,
        NoteAssetResolverService,
        InvestmentImportLogService,
        InvestmentImportMetricsService
    ],
    exports: [
        InvestmentImportPreviewApplication,
        InvestmentImportCommitApplication,
        InvestmentImportListApplication,
        InvestmentImportAssistantService
    ]
})
export class InvestmentImportApplicationModule {}
