import { Module } from '@nestjs/common';
import { PlansApplicationModule } from '../../application/plans-application.module';
import { PremiumEndedSweepCommand, PremiumEndedSweepTickHandler } from './premium-ended-sweep.command';

@Module({
    imports: [PlansApplicationModule],
    providers: [PremiumEndedSweepCommand, PremiumEndedSweepTickHandler]
})
export class PlansCommandModule {}
