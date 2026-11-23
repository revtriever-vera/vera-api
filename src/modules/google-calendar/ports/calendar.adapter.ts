import {
    CalendarAccess,
    CalendarEvent,
    CalendarGrant,
    CalendarProvider,
    CalendarRange,
    CalendarSession,
    CodeExchange,
    CreatedCalendarEvent,
    NewCalendarEvent
} from '../domain/calendar.types';

export type CalendarDriverName = 'mock' | 'google';

export abstract class CalendarAdapter {
    public abstract readonly provider: CalendarProvider;
    public abstract readonly driver: CalendarDriverName;
    public abstract exchangeCode(input: CodeExchange): Promise<CalendarGrant>;
    public abstract listUpcoming(session: CalendarSession, range: CalendarRange): Promise<CalendarEvent[]>;
    public abstract createEvent(session: CalendarSession, event: NewCalendarEvent): Promise<CreatedCalendarEvent>;
    public abstract accessOf(session: CalendarSession): CalendarAccess;
    public abstract revoke(session: CalendarSession): Promise<void>;
}
