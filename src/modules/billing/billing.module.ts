import { Module } from '@nestjs/common';
import { BillingHttpModule } from './access/http/billing-http.module';

@Module({
    imports: [BillingHttpModule]
})
export class BillingModule {}
