import { Module } from '@nestjs/common';
import { PlansApplicationModule } from '../../application/plans-application.module';
import { UsageCleanupCommand, UsageCleanupTickHandler, UsageGaugeCommand, UsageGaugeTickHandler } from './usage-maintenance.command';
import { PremiumEndedSweepCommand, PremiumEndedSweepTickHandler } from './premium-ended-sweep.command';

@Module({
    imports: [PlansApplicationModule],
    providers: [
        PremiumEndedSweepCommand,
        PremiumEndedSweepTickHandler,
        UsageCleanupCommand,
        UsageCleanupTickHandler,
        UsageGaugeCommand,
        UsageGaugeTickHandler
    ]
})
export class PlansCommandModule {}
