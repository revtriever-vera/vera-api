import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { ObservabilityModule } from '../../../core/observability/observability.module';
import { QueueModule } from '../../../core/queue/queue.module';
import { IdentityApplicationModule } from '../../identity/application/identity-application.module';
import { SpendingCategoriesApplicationModule } from '../../spending-categories/application/spending-categories-application.module';
import { TransactionsApplicationModule } from '../../transactions/application/transactions-application.module';
import { RecurringDomainModule } from '../domain/recurring-domain.module';
import { RecurringOverviewTool } from '../services/recurring-ask-vera.tool';
import { RecurringUpcomingService } from '../services/recurring-upcoming.service';
import { RecurringAccountEraser } from '../services/recurring-account.eraser';
import { RecurringAccountExporter } from '../services/recurring-account.exporter';
import { RecurringAccountSpreadsheet } from '../services/recurring-account.spreadsheet';
import { RecurringAlertService } from '../services/recurring-alert.service';
import { RecurringCategoryService } from '../services/recurring-category.service';
import { RecurringDetectPublisherService } from '../services/recurring-detect-publisher.service';
import { RecurringDetectionInputService } from '../services/recurring-detection-input.service';
import { RecurringDetectionService } from '../services/recurring-detection.service';
import { RecurringLogService } from '../services/recurring-log.service';
import { RecurringSampleDataService } from '../services/recurring-sample-data.service';
import { RecurringMarkDriver } from '../services/recurring-mark.driver';
import { RecurringRefreshDriver } from '../services/recurring-refresh.driver';
import { RecurringDetectionApplication } from './recurring-detection.application';
import { RecurringOverviewApplication } from './recurring-overview.application';
import { RecurringReviewApplication } from './recurring-review.application';

@Module({
    imports: [
        RecurringDomainModule,
        TransactionsApplicationModule,
        SpendingCategoriesApplicationModule,
        IdentityApplicationModule,
        QueueModule,
        ContextModule,
        ObservabilityModule
    ],
    providers: [
        RecurringReviewApplication,
        RecurringOverviewApplication,
        RecurringDetectionApplication,
        RecurringAlertService,
        RecurringDetectionService,
        RecurringDetectionInputService,
        RecurringCategoryService,
        RecurringDetectPublisherService,
        RecurringRefreshDriver,
        RecurringMarkDriver,
        RecurringAccountExporter,
        RecurringAccountSpreadsheet,
        RecurringAccountEraser,
        RecurringSampleDataService,
        RecurringUpcomingService,
        RecurringOverviewTool,
        RecurringLogService
    ],
    exports: [RecurringReviewApplication, RecurringOverviewApplication, RecurringDetectionApplication, RecurringUpcomingService]
})
export class RecurringApplicationModule {}
