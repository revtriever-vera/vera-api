import { Module } from '@nestjs/common';
import { RemindersApplicationModule } from '../../application/reminders-application.module';
import { RemindersGaugeCommand, RemindersGaugeTickHandler } from './reminders-gauge.command';
import { RemindersSweepCommand, RemindersSweepTickHandler } from './reminders-sweep.command';

@Module({
    imports: [RemindersApplicationModule],
    providers: [RemindersSweepCommand, RemindersSweepTickHandler, RemindersGaugeCommand, RemindersGaugeTickHandler]
})
export class RemindersCommandModule {}
