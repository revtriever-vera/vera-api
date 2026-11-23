import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { googleCalendarConfig } from '../config/google-calendar.config';
import { CalendarProvider } from '../domain/calendar.types';
import { GoogleCalendarAdapter } from '../drivers/google-calendar.adapter';
import { MockCalendarAdapter } from '../drivers/mock-calendar.adapter';
import { CalendarAdapter, CalendarDriverName } from '../ports/calendar.adapter';

@Injectable()
export class CalendarAdapterRegistry {
    private readonly byProvider: ReadonlyMap<CalendarProvider, Readonly<Record<CalendarDriverName, CalendarAdapter>>>;

    public constructor(
        google: GoogleCalendarAdapter,
        mock: MockCalendarAdapter,
        @Inject(googleCalendarConfig.KEY) private readonly config: ConfigType<typeof googleCalendarConfig>
    ) {
        this.byProvider = new Map([[google.provider, { google, mock }]]);
    }

    public of(provider: CalendarProvider): CalendarAdapter {
        const adapter: CalendarAdapter | undefined = this.byProvider.get(provider)?.[this.config.GOOGLE_CALENDAR_DRIVER];
        if (adapter === undefined) {
            throw new Error(`no calendar adapter for ${provider}`);
        }
        return adapter;
    }
}
