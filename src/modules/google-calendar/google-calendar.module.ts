import { Module } from '@nestjs/common';
import { GoogleCalendarHttpModule } from './access/http/google-calendar-http.module';

@Module({
    imports: [GoogleCalendarHttpModule]
})
export class GoogleCalendarModule {}
