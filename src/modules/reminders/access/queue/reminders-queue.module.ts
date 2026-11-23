import { Module } from '@nestjs/common';
import { RemindersApplicationModule } from '../../application/reminders-application.module';
import { ReminderDeliveryObserver, ReminderFireHandler } from './reminder-fire.handler';

@Module({
    imports: [RemindersApplicationModule],
    providers: [ReminderFireHandler, ReminderDeliveryObserver]
})
export class RemindersQueueModule {}
