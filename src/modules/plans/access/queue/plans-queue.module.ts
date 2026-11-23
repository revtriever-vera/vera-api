import { Module } from '@nestjs/common';
import { PlansApplicationModule } from '../../application/plans-application.module';
import { UsageThresholdHandler } from './usage-threshold.handler';
import { PremiumEndedRetryHandler } from './premium-ended-retry.handler';

@Module({
    imports: [PlansApplicationModule],
    providers: [PremiumEndedRetryHandler, UsageThresholdHandler]
})
export class PlansQueueModule {}
