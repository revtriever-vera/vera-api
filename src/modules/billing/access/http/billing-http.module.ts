import { Module } from '@nestjs/common';
import { BillingApplicationModule } from '../../application/billing-application.module';
import { BillingDevController } from './billing-dev.controller';

@Module({
    imports: [BillingApplicationModule],
    controllers: [BillingDevController]
})
export class BillingHttpModule {}
