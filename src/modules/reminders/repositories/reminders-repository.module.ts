import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { ReminderOccurrencesRepository } from './reminder-occurrences.repository';
import { RemindersRepository } from './reminders.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [RemindersRepository, ReminderOccurrencesRepository],
    exports: [RemindersRepository, ReminderOccurrencesRepository]
})
export class RemindersRepositoryModule {}
