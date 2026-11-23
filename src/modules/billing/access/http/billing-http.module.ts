import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { BillingApplicationModule } from '../../application/billing-application.module';
import { BillingDevController } from './billing-dev.controller';
import { InvoicesController } from './invoices.controller';
import { PaymentMethodController } from './payment-method.controller';
import { RevtrieverPriceController } from './revtriever-price.controller';
import { RevtrieverWebhookController } from './revtriever-webhook.controller';
import { SubscriptionController } from './subscription.controller';

@Module({
    imports: [BillingApplicationModule, IdentityApplicationModule, ContextModule, ThrottleModule],
    controllers: [
        BillingDevController,
        SubscriptionController,
        PaymentMethodController,
        InvoicesController,
        RevtrieverWebhookController,
        RevtrieverPriceController
    ]
})
export class BillingHttpModule {}
