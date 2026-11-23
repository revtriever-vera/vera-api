import { Module } from '@nestjs/common';
import { RecurringApplicationModule } from '../../application/recurring-application.module';
import { RecurringDailyCommand, RecurringDailyTickHandler } from './recurring-daily.command';

@Module({
    imports: [RecurringApplicationModule],
    providers: [RecurringDailyCommand, RecurringDailyTickHandler]
})
export class RecurringCommandModule {}
