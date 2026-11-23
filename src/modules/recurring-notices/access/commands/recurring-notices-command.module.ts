import { Module } from '@nestjs/common';
import { RecurringNoticesApplicationModule } from '../../application/recurring-notices-application.module';
import { RecurringNoticesDailyCommand, RecurringNoticesDailyTickHandler } from './recurring-notices-daily.command';

@Module({
    imports: [RecurringNoticesApplicationModule],
    providers: [RecurringNoticesDailyCommand, RecurringNoticesDailyTickHandler]
})
export class RecurringNoticesCommandModule {}
