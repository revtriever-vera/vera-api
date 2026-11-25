import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { LlmModule } from '../../../core/llm/llm.module';
import { ThrottleModule } from '../../../core/throttle/throttle.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { CatalogApplicationModule } from '../../catalog/application/catalog-application.module';
import { FixedIncomeApplicationModule } from '../../fixed-income/application/fixed-income-application.module';
import { PositionsApplicationModule } from '../../positions/application/positions-application.module';
import { InvestmentImportDomainModule } from '../domain/investment-import-domain.module';
import { ImportLineEvaluatorService } from '../services/import-line-evaluator.service';
import { InvestmentImportLogService } from '../services/investment-import-log.service';
import { InvestmentImportReporterService } from '../services/investment-import-reporter.service';
import { InvestmentImportMetricsService } from '../services/investment-import-metrics.service';
import { ModelReaderService } from '../services/model-reader.service';
import { InvestmentImportCommitApplication } from './investment-import-commit.application';
import { InvestmentImportListApplication } from './investment-import-list.application';
import { InvestmentImportPreviewApplication } from './investment-import-preview.application';

@Module({
    imports: [
        InvestmentImportDomainModule,
        PositionsApplicationModule,
        CatalogApplicationModule,
        FixedIncomeApplicationModule,
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
        InvestmentImportLogService,
        InvestmentImportMetricsService,
        InvestmentImportReporterService,
        ModelReaderService
    ],
    exports: [InvestmentImportPreviewApplication, InvestmentImportCommitApplication, InvestmentImportListApplication]
})
export class InvestmentImportApplicationModule {}
