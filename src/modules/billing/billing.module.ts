import { Module } from '@nestjs/common';
import { BillingCommandsModule } from './access/commands/billing-commands.module';
import { BillingHttpModule } from './access/http/billing-http.module';
import { BillingQueueModule } from './access/queue/billing-queue.module';

@Module({
    imports: [BillingHttpModule, BillingQueueModule, BillingCommandsModule]
})
export class BillingModule {}
