import { Module } from '@nestjs/common';
import { RemindersRepositoryModule } from '../repositories/reminders-repository.module';
import { ReminderDomain } from './reminder.domain';

@Module({
    imports: [RemindersRepositoryModule],
    providers: [ReminderDomain],
    exports: [ReminderDomain]
})
export class RemindersDomainModule {}
