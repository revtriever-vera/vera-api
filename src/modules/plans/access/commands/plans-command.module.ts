import { Module } from '@nestjs/common';
import { PlansApplicationModule } from '../../application/plans-application.module';
import { UsageCleanupCommand, UsageCleanupTickHandler, UsageGaugeCommand, UsageGaugeTickHandler } from './usage-maintenance.command';
import { PremiumEndedSweepCommand, PremiumEndedSweepTickHandler } from './premium-ended-sweep.command';
import { TrialSweepCommand, TrialSweepTickHandler } from './trial-sweep.command';

@Module({
    imports: [PlansApplicationModule],
    providers: [
        PremiumEndedSweepCommand,
        PremiumEndedSweepTickHandler,
        TrialSweepCommand,
        TrialSweepTickHandler,
        UsageCleanupCommand,
        UsageCleanupTickHandler,
        UsageGaugeCommand,
        UsageGaugeTickHandler
    ]
})
export class PlansCommandModule {}
