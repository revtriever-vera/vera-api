import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { TransactionsApplicationModule } from '../../transactions/application/transactions-application.module';
import { StatementImportLogService } from '../services/statement-import-log.service';
import { StatementImportMetricsService } from '../services/statement-import-metrics.service';
import { StatementParserService } from '../services/statement-parser.service';
import { ImportCommitApplication } from './import-commit.application';
import { ImportListApplication } from './import-list.application';
import { ImportPreviewApplication } from './import-preview.application';

@Module({
    imports: [TransactionsApplicationModule, ObservabilityModule],
    providers: [
        ImportPreviewApplication,
        ImportCommitApplication,
        ImportListApplication,
        StatementParserService,
        StatementImportLogService,
        StatementImportMetricsService
    ],
    exports: [ImportPreviewApplication, ImportCommitApplication, ImportListApplication]
})
export class StatementImportApplicationModule {}
