import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { CatalogApplicationModule } from '../../catalog/application/catalog-application.module';
import { FixedIncomeApplicationModule } from '../../fixed-income/application/fixed-income-application.module';
import { MarketDataApplicationModule } from '../../market-data/application/market-data-application.module';
import { PositionsApplicationModule } from '../../positions/application/positions-application.module';
import { InvestmentImportDomainModule } from '../domain/investment-import-domain.module';
import { FixedIncomeProposalService } from '../services/fixed-income-proposal.service';
import { ImportLineEvaluatorService } from '../services/import-line-evaluator.service';
import { InvestmentImportLogService } from '../services/investment-import-log.service';
import { InvestmentImportMetricsService } from '../services/investment-import-metrics.service';
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
        ContextModule
    ],
    providers: [
        InvestmentImportPreviewApplication,
        InvestmentImportCommitApplication,
        InvestmentImportListApplication,
        ImportLineEvaluatorService,
        FixedIncomeProposalService,
        StatementReaderService,
        InvestmentImportLogService,
        InvestmentImportMetricsService
    ],
    exports: [InvestmentImportPreviewApplication, InvestmentImportCommitApplication, InvestmentImportListApplication]
})
export class InvestmentImportApplicationModule {}
