import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { googleCalendarConfig } from '../config/google-calendar.config';
import { accessFromScopes } from '../domain/calendar-access';
import { CalendarProviderUnavailableError, CalendarReadOnlyError, CalendarTokenRevokedError } from '../domain/calendar.errors';
import {
    CALENDAR_PROVIDERS,
    CalendarAccess,
    CalendarEvent,
    CalendarGrant,
    CalendarProvider,
    CalendarRange,
    CalendarSession,
    CodeExchange,
    CreatedCalendarEvent,
    NewCalendarEvent,
    VERA_SOURCE
} from '../domain/calendar.types';
import { CalendarAdapter, CalendarDriverName } from '../ports/calendar.adapter';
import { GoogleEvent, eventsResponseSchema } from './google-api.schemas';
import { GoogleOAuthHttp } from './google-oauth-http';

const EVENTS_URL: string = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const HTTP_UNAUTHORIZED: number = 401;
const HTTP_FORBIDDEN: number = 403;
const HTTP_CONFLICT: number = 409;

function instantOf(when: GoogleEvent['start']): { readonly iso: string; readonly allDay: boolean } | null {
    if (when.dateTime !== undefined) {
        return { iso: new Date(when.dateTime).toISOString(), allDay: false };
    }
    return when.date === undefined ? null : { iso: `${when.date}T00:00:00.000Z`, allDay: true };
}

function eventOf(item: GoogleEvent): CalendarEvent | null {
    const start: ReturnType<typeof instantOf> = instantOf(item.start);
    const end: ReturnType<typeof instantOf> = instantOf(item.end);
    if (item.status === 'cancelled' || start === null || end === null) {
        return null;
    }
    return {
        id: item.id,
        title: item.summary ?? '',
        start: start.iso,
        end: end.iso,
        allDay: start.allDay,
        byVera: item.extendedProperties?.private?.['source'] === VERA_SOURCE
    };
}

function bodyOf(event: NewCalendarEvent): string {
    return JSON.stringify({
        id: event.idempotencyKey,
        summary: event.summary,
        start: { dateTime: event.start.toISOString(), timeZone: event.timeZone },
        end: { dateTime: event.end.toISOString(), timeZone: event.timeZone },
        extendedProperties: { private: { source: event.source } }
    });
}

@Injectable()
export class GoogleCalendarAdapter extends CalendarAdapter {
    public readonly provider: CalendarProvider = CALENDAR_PROVIDERS.google;
    public readonly driver: CalendarDriverName = 'google';

    public constructor(
        private readonly oauth: GoogleOAuthHttp,
        @Inject(googleCalendarConfig.KEY) private readonly config: ConfigType<typeof googleCalendarConfig>
    ) {
        super();
    }

    public async exchangeCode(input: CodeExchange): Promise<CalendarGrant> {
        return this.oauth.exchange(input);
    }

    public async listUpcoming(session: CalendarSession, range: CalendarRange): Promise<CalendarEvent[]> {
        const query: URLSearchParams = new URLSearchParams({
            timeMin: range.from.toISOString(),
            timeMax: range.to.toISOString(),
            singleEvents: 'true',
            orderBy: 'startTime',
            maxResults: String(range.max)
        });
        const response: Response = await this.call(session, `${EVENTS_URL}?${query.toString()}`, { method: 'GET' });
        const parsed: ReturnType<typeof eventsResponseSchema.safeParse> = eventsResponseSchema.safeParse(
            await response.json().catch((): unknown => ({}))
        );
        if (!response.ok || !parsed.success) {
            throw new CalendarProviderUnavailableError();
        }
        return parsed.data.items.map(eventOf).filter((event: CalendarEvent | null): event is CalendarEvent => event !== null);
    }

    public async createEvent(session: CalendarSession, event: NewCalendarEvent): Promise<CreatedCalendarEvent> {
        const eventId: string = event.idempotencyKey;
        const response: Response = await this.call(session, EVENTS_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: bodyOf(event)
        });
        if (response.status === HTTP_CONFLICT) {
            return { eventId, duplicate: true };
        }
        if (response.status === HTTP_FORBIDDEN) {
            throw new CalendarReadOnlyError();
        }
        if (!response.ok) {
            throw new CalendarProviderUnavailableError();
        }
        return { eventId, duplicate: false };
    }

    public accessOf(session: CalendarSession): CalendarAccess {
        return accessFromScopes(session.scopes) ?? 'read_only';
    }

    public async revoke(session: CalendarSession): Promise<void> {
        await this.oauth.revoke(session.refreshToken);
    }

    private async call(session: CalendarSession, url: string, init: RequestInit): Promise<Response> {
        const accessToken: string = await this.oauth.accessToken(session.refreshToken, session.credentials);
        try {
            const headers: Headers = new Headers(init.headers);
            headers.set('authorization', `Bearer ${accessToken}`);
            const response: Response = await fetch(url, {
                ...init,
                headers,
                signal: AbortSignal.timeout(this.config.GOOGLE_CALENDAR_TIMEOUT_MS)
            });
            if (response.status === HTTP_UNAUTHORIZED) {
                throw new CalendarTokenRevokedError();
            }
            return response;
        } catch (error: unknown) {
            throw error instanceof CalendarTokenRevokedError ? error : new CalendarProviderUnavailableError(error);
        }
    }
}
