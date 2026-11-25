import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { CatalogApplicationModule } from '../../catalog/application/catalog-application.module';
import { PositionsApplicationModule } from '../../positions/application/positions-application.module';
import { InvestmentImportDomainModule } from '../domain/investment-import-domain.module';
import { ImportLineEvaluatorService } from '../services/import-line-evaluator.service';
import { InvestmentImportLogService } from '../services/investment-import-log.service';
import { InvestmentImportMetricsService } from '../services/investment-import-metrics.service';
import { InvestmentImportCommitApplication } from './investment-import-commit.application';
import { InvestmentImportListApplication } from './investment-import-list.application';
import { InvestmentImportPreviewApplication } from './investment-import-preview.application';

@Module({
    imports: [InvestmentImportDomainModule, PositionsApplicationModule, CatalogApplicationModule, ObservabilityModule, ContextModule],
    providers: [
        InvestmentImportPreviewApplication,
        InvestmentImportCommitApplication,
        InvestmentImportListApplication,
        ImportLineEvaluatorService,
        InvestmentImportLogService,
        InvestmentImportMetricsService
    ],
    exports: [InvestmentImportPreviewApplication, InvestmentImportCommitApplication, InvestmentImportListApplication]
})
export class InvestmentImportApplicationModule {}
