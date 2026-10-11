import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { SpendingCategoriesApplicationModule } from '../../spending-categories/application/spending-categories-application.module';
import { TransactionsApplicationModule } from '../../transactions/application/transactions-application.module';
import { SpendingSummaryDomainModule } from '../domain/spending-summary-domain.module';
import { SpendingSettingsAccountExporter } from '../services/spending-settings-account.exporter';
import { SpendingSettingsReaderService } from '../services/spending-settings-reader.service';
import { SpendingSummaryLogService } from '../services/spending-summary-log.service';
import { SpendingSummaryMetricsService } from '../services/spending-summary-metrics.service';
import { SpendingSummaryService } from '../services/spending-summary.service';
import { SettingsApplication } from './settings.application';
import { SummaryApplication } from './summary.application';

@Module({
    imports: [
        SpendingSummaryDomainModule,
        TransactionsApplicationModule,
        SpendingCategoriesApplicationModule,
        IdentityApplicationModule,
        ContextModule,
        ObservabilityModule
    ],
    providers: [
        SummaryApplication,
        SettingsApplication,
        SpendingSummaryService,
        SpendingSettingsReaderService,
        SpendingSettingsAccountExporter,
        SpendingSummaryLogService,
        SpendingSummaryMetricsService
    ],
    exports: [SummaryApplication, SettingsApplication, SpendingSummaryService, SpendingSettingsReaderService]
})
export class SpendingSummaryApplicationModule {}
