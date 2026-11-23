import { Module } from '@nestjs/common';
import { GoogleCalendarRepositoryModule } from '../repositories/google-calendar-repository.module';
import { CalendarConnectionDomain } from './calendar-connection.domain';
import { CalendarEventCreatedDomain } from './calendar-event-created.domain';
import { CalendarOAuthStateDomain } from './calendar-oauth-state.domain';

@Module({
    imports: [GoogleCalendarRepositoryModule],
    providers: [CalendarConnectionDomain, CalendarOAuthStateDomain, CalendarEventCreatedDomain],
    exports: [CalendarConnectionDomain, CalendarOAuthStateDomain, CalendarEventCreatedDomain]
})
export class GoogleCalendarDomainModule {}
