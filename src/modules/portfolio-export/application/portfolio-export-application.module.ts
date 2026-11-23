import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { IssuersServicesModule } from '../../issuers/services/issuers-services.module';
import { PortfolioApplicationModule } from '../../portfolio/application/portfolio-application.module';
import { PortfolioExportLogService } from '../services/portfolio-export-log.service';
import { PortfolioAccountSpreadsheet } from '../services/portfolio-account.spreadsheet';
import { PortfolioExportTableService } from '../services/portfolio-export-table.service';
import { PortfolioExportMetricsService } from '../services/portfolio-export-metrics.service';
import { XlsxWriterService } from '../services/xlsx-writer.service';
import { PortfolioExportApplication } from './portfolio-export.application';

@Module({
    imports: [ContextModule, ObservabilityModule, PortfolioApplicationModule, IdentityApplicationModule, IssuersServicesModule],
    providers: [
        PortfolioExportApplication,
        PortfolioAccountSpreadsheet,
        PortfolioExportTableService,
        XlsxWriterService,
        PortfolioExportLogService,
        PortfolioExportMetricsService
    ],
    exports: [PortfolioExportApplication]
})
export class PortfolioExportApplicationModule {}
