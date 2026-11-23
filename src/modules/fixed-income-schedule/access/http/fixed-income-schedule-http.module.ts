import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { FixedIncomeScheduleApplicationModule } from '../../application/fixed-income-schedule-application.module';
import { ScheduleController } from './schedule.controller';

@Module({
    imports: [FixedIncomeScheduleApplicationModule, IdentityApplicationModule, ContextModule],
    controllers: [ScheduleController]
})
export class FixedIncomeScheduleHttpModule {}
