import { Module } from '@nestjs/common';
import { FixedIncomeScheduleHttpModule } from './access/http/fixed-income-schedule-http.module';

@Module({
    imports: [FixedIncomeScheduleHttpModule]
})
export class FixedIncomeScheduleModule {}
