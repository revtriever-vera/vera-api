import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { SpendingCategoriesApplicationModule } from '../../spending-categories/application/spending-categories-application.module';
import { TransactionsApplicationModule } from '../../transactions/application/transactions-application.module';
import { TransactionsExportLogService } from '../services/transactions-export-log.service';
import { TransactionsExportMetricsService } from '../services/transactions-export-metrics.service';
import { TransactionsExportApplication } from './transactions-export.application';

@Module({
    imports: [
        ContextModule,
        ObservabilityModule,
        TransactionsApplicationModule,
        SpendingCategoriesApplicationModule,
        IdentityApplicationModule
    ],
    providers: [TransactionsExportApplication, TransactionsExportLogService, TransactionsExportMetricsService],
    exports: [TransactionsExportApplication]
})
export class TransactionsExportApplicationModule {}
