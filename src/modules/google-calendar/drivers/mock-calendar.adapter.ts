import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { accessFromScopes } from '../domain/calendar-access';
import { CalendarTokenRevokedError } from '../domain/calendar.errors';
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
    READ_ONLY_SCOPES,
    SCOPE_READ_WRITE,
    VERA_SOURCE
} from '../domain/calendar.types';
import { CalendarAdapter, CalendarDriverName } from '../ports/calendar.adapter';

const MOCK_EMAIL: string = 'pessoa@exemplo.test';
const NO_CALENDAR_SCOPES: readonly string[] = ['openid', 'email'];

export interface MockStoredEvent extends CalendarEvent {
    readonly refreshToken: string;
}

const GRANTS: Readonly<Record<string, readonly string[]>> = {
    read_write: [SCOPE_READ_WRITE],
    read_only: READ_ONLY_SCOPES.slice(0, 1),
    no_scope: NO_CALENDAR_SCOPES
};

function settle<T>(work: () => T): Promise<T> {
    try {
        return Promise.resolve(work());
    } catch (error: unknown) {
        return Promise.reject(error instanceof Error ? error : new Error('mock calendar failure'));
    }
}

@Injectable()
export class MockCalendarAdapter extends CalendarAdapter {
    public readonly provider: CalendarProvider = CALENDAR_PROVIDERS.google;
    public readonly driver: CalendarDriverName = 'mock';
    private readonly events: Map<string, MockStoredEvent> = new Map<string, MockStoredEvent>();
    private readonly revoked: Set<string> = new Set<string>();
    private readonly invalid: Set<string> = new Set<string>();

    public exchangeCode(input: CodeExchange): Promise<CalendarGrant> {
        const [kind, email, variant]: string[] = input.code.split(':');
        if (kind !== 'mock') {
            return Promise.reject(new CalendarTokenRevokedError());
        }
        return Promise.resolve({
            refreshToken: `mock-refresh-${randomUUID()}`,
            scopes: GRANTS[variant ?? 'read_write'] ?? GRANTS['read_write'] ?? [],
            email: email === undefined || email === '' ? MOCK_EMAIL : email
        });
    }

    public listUpcoming(session: CalendarSession, range: CalendarRange): Promise<CalendarEvent[]> {
        return settle((): CalendarEvent[] => {
            this.assertValid(session);
            return [...this.events.values()]
                .filter((event: MockStoredEvent): boolean => event.refreshToken === session.refreshToken)
                .filter((event: MockStoredEvent): boolean => new Date(event.start) >= range.from && new Date(event.start) <= range.to)
                .sort((left: MockStoredEvent, right: MockStoredEvent): number => left.start.localeCompare(right.start))
                .slice(0, range.max)
                .map(({ refreshToken: _refreshToken, ...event }: MockStoredEvent): CalendarEvent => event);
        });
    }

    public createEvent(session: CalendarSession, event: NewCalendarEvent): Promise<CreatedCalendarEvent> {
        return settle((): CreatedCalendarEvent => {
            this.assertValid(session);
            const known: boolean = this.events.has(event.idempotencyKey);
            if (!known) {
                this.events.set(event.idempotencyKey, {
                    id: event.idempotencyKey,
                    title: event.summary,
                    start: event.start.toISOString(),
                    end: event.end.toISOString(),
                    allDay: false,
                    byVera: event.source === VERA_SOURCE,
                    refreshToken: session.refreshToken
                });
            }
            return { eventId: event.idempotencyKey, duplicate: known };
        });
    }

    public accessOf(session: CalendarSession): CalendarAccess {
        return accessFromScopes(session.scopes) ?? 'read_only';
    }

    public revoke(session: CalendarSession): Promise<void> {
        return settle((): void => {
            this.revoked.add(session.refreshToken);
        });
    }

    public seed(refreshToken: string, event: Pick<CalendarEvent, 'id' | 'title' | 'start' | 'end'> & { readonly byVera?: boolean }): void {
        this.events.set(event.id, { allDay: false, byVera: false, ...event, refreshToken });
    }

    public invalidate(refreshToken: string): void {
        this.invalid.add(refreshToken);
    }

    public wasRevoked(refreshToken: string): boolean {
        return this.revoked.has(refreshToken);
    }

    public revokedTokens(): readonly string[] {
        return [...this.revoked];
    }

    public storedEvents(): readonly MockStoredEvent[] {
        return [...this.events.values()];
    }

    private assertValid(session: CalendarSession): void {
        if (this.invalid.has(session.refreshToken)) {
            throw new CalendarTokenRevokedError();
        }
    }
}
