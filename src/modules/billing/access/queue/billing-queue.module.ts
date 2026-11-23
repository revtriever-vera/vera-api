import { Module } from '@nestjs/common';
import { BillingApplicationModule } from '../../application/billing-application.module';
import { RevtrieverEventHandler } from './revtriever-event.handler';

@Module({
    imports: [BillingApplicationModule],
    providers: [RevtrieverEventHandler]
})
export class BillingQueueModule {}
