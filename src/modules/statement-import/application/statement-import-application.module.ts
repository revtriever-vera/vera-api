import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { LlmModule } from '../../../core/llm/llm.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { QueueModule } from '../../../core/queue/queue.module';
import { ThrottleModule } from '../../../core/throttle/throttle.module';
import { InvestmentImportApplicationModule } from '../../investment-import/application/investment-import-application.module';
import { TransactionsApplicationModule } from '../../transactions/application/transactions-application.module';
import { StatementImportDomainModule } from '../domain/statement-import-domain.module';
import { StatementImportLogService } from '../services/statement-import-log.service';
import { StatementImportMetricsService } from '../services/statement-import-metrics.service';
import { StatementModelPreviewService } from '../services/statement-model-preview.service';
import { StatementModelReaderService } from '../services/statement-model-reader.service';
import { StatementParserService } from '../services/statement-parser.service';
import { ImportCommitApplication } from './import-commit.application';
import { ImportListApplication } from './import-list.application';
import { ImportPreviewApplication } from './import-preview.application';

@Module({
    imports: [
        StatementImportDomainModule,
        TransactionsApplicationModule,
        InvestmentImportApplicationModule,
        ObservabilityModule,
        ContextModule,
        LlmModule,
        ThrottleModule,
        QueueModule
    ],
    providers: [
        ImportPreviewApplication,
        ImportCommitApplication,
        ImportListApplication,
        StatementParserService,
        StatementModelReaderService,
        StatementModelPreviewService,
        StatementImportLogService,
        StatementImportMetricsService
    ],
    exports: [ImportPreviewApplication, ImportCommitApplication, ImportListApplication]
})
export class StatementImportApplicationModule {}
