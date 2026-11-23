import { Module, Type } from '@nestjs/common';
import { BillingRepositoryModule } from '../repositories/billing-repository.module';
import { BillingInvoiceDomain } from './billing-invoice.domain';
import { BillingNotificationDomain } from './billing-notification.domain';
import { BillingPendingCancellationDomain } from './billing-pending-cancellation.domain';
import { BillingPriceQuoteDomain } from './billing-price-quote.domain';
import { BillingRefundRequestDomain } from './billing-refund-request.domain';
import { BillingSubscriptionDomain } from './billing-subscription.domain';
import { CompanyBillingStandingDomain } from './company-billing-standing.domain';
import { RevtrieverEventCursorDomain } from './revtriever-event-cursor.domain';
import { RevtrieverEventDomain } from './revtriever-event.domain';

const DOMAINS: Type[] = [
    BillingSubscriptionDomain,
    BillingInvoiceDomain,
    BillingPriceQuoteDomain,
    CompanyBillingStandingDomain,
    BillingNotificationDomain,
    BillingRefundRequestDomain,
    BillingPendingCancellationDomain,
    RevtrieverEventDomain,
    RevtrieverEventCursorDomain
];

@Module({
    imports: [BillingRepositoryModule],
    providers: DOMAINS,
    exports: DOMAINS
})
export class BillingDomainModule {}
