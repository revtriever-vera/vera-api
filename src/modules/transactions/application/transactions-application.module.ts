import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { CryptoModule } from '../../../core/crypto/crypto.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { SpendingCategoriesApplicationModule } from '../../spending-categories/application/spending-categories-application.module';
import { TransactionsDomainModule } from '../domain/transactions-domain.module';
import { FinancialAccountService } from '../services/financial-account.service';
import { SpendingDatasetService } from '../services/spending-dataset.service';
import { SpendingSampleDatasetService } from '../services/spending-sample-dataset.service';
import { SpendingSampleDataService } from '../services/spending-sample-data.service';
import { TransactionsAccountExporter } from '../services/transactions-account.exporter';
import { TransactionAggregatesService } from '../services/transaction-aggregates.service';
import { TransactionFingerprintService } from '../services/transaction-fingerprint.service';
import { TransactionImportService } from '../services/transaction-import.service';
import { TransactionIngestionService } from '../services/transaction-ingestion.service';
import { TransactionReaderService } from '../services/transaction-reader.service';
import { TransactionsLogService } from '../services/transactions-log.service';
import { TransactionsMetricsService } from '../services/transactions-metrics.service';
import { TransactionsRecategorizationDriver } from '../services/transactions-recategorization.driver';
import { AccountApplication } from './account.application';
import { TransactionListApplication } from './transaction-list.application';
import { TransactionRecategorizeApplication } from './transaction-recategorize.application';

@Module({
    imports: [
        TransactionsDomainModule,
        SpendingCategoriesApplicationModule,
        IdentityApplicationModule,
        CryptoModule,
        ContextModule,
        ObservabilityModule
    ],
    providers: [
        TransactionListApplication,
        TransactionRecategorizeApplication,
        AccountApplication,
        TransactionsLogService,
        TransactionsMetricsService,
        TransactionsRecategorizationDriver,
        TransactionIngestionService,
        FinancialAccountService,
        TransactionImportService,
        TransactionAggregatesService,
        TransactionReaderService,
        TransactionFingerprintService,
        SpendingDatasetService,
        SpendingSampleDatasetService,
        TransactionsAccountExporter,
        SpendingSampleDataService
    ],
    exports: [
        TransactionListApplication,
        TransactionRecategorizeApplication,
        AccountApplication,
        TransactionIngestionService,
        FinancialAccountService,
        TransactionImportService,
        TransactionAggregatesService,
        TransactionReaderService,
        TransactionFingerprintService,
        SpendingDatasetService
    ]
})
export class TransactionsApplicationModule {}
