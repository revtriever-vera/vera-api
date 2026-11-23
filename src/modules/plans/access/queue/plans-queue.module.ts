import { Module } from '@nestjs/common';
import { PlansApplicationModule } from '../../application/plans-application.module';
import { PremiumEndedRetryHandler } from './premium-ended-retry.handler';

@Module({
    imports: [PlansApplicationModule],
    providers: [PremiumEndedRetryHandler]
})
export class PlansQueueModule {}
