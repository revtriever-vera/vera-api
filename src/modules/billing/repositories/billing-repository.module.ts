import { Module, Type } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { BillingInvoicesRepository } from './billing-invoices.repository';
import { BillingNotificationsRepository } from './billing-notifications.repository';
import { BillingPendingCancellationsRepository } from './billing-pending-cancellations.repository';
import { BillingPriceQuotesRepository } from './billing-price-quotes.repository';
import { BillingRefundRequestsRepository } from './billing-refund-requests.repository';
import { BillingSubscriptionsRepository } from './billing-subscriptions.repository';
import { CompanyBillingStandingsRepository } from './company-billing-standings.repository';
import { RevtrieverEventCursorsRepository } from './revtriever-event-cursors.repository';
import { RevtrieverEventsRepository } from './revtriever-events.repository';

const REPOSITORIES: Type[] = [
    BillingSubscriptionsRepository,
    BillingInvoicesRepository,
    BillingPriceQuotesRepository,
    CompanyBillingStandingsRepository,
    BillingNotificationsRepository,
    BillingRefundRequestsRepository,
    BillingPendingCancellationsRepository,
    RevtrieverEventsRepository,
    RevtrieverEventCursorsRepository
];

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: REPOSITORIES,
    exports: REPOSITORIES
})
export class BillingRepositoryModule {}
