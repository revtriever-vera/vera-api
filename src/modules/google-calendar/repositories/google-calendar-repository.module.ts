import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { CalendarConnectionsRepository } from './calendar-connections.repository';
import { CalendarEventsCreatedRepository } from './calendar-events-created.repository';
import { CalendarOAuthStatesRepository } from './calendar-oauth-states.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [CalendarConnectionsRepository, CalendarOAuthStatesRepository, CalendarEventsCreatedRepository],
    exports: [CalendarConnectionsRepository, CalendarOAuthStatesRepository, CalendarEventsCreatedRepository]
})
export class GoogleCalendarRepositoryModule {}
