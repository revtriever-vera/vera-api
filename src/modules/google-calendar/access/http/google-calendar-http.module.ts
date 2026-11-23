import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { PlansApplicationModule } from '../../../plans/application/plans-application.module';
import { GoogleCalendarApplicationModule } from '../../application/google-calendar-application.module';
import { CalendarController } from './calendar.controller';
import { CalendarOauthController } from './calendar-oauth.controller';

@Module({
    imports: [GoogleCalendarApplicationModule, IdentityApplicationModule, PlansApplicationModule, ContextModule],
    controllers: [CalendarController, CalendarOauthController]
})
export class GoogleCalendarHttpModule {}
