import { Selectable } from 'kysely';
import { CalendarConnections } from '../../../core/database/generated/database.types';

export type CalendarConnection = Selectable<CalendarConnections>;

export const CALENDAR_PROVIDERS = { google: 'google' } as const;
export type CalendarProvider = (typeof CALENDAR_PROVIDERS)[keyof typeof CALENDAR_PROVIDERS];

export const CONNECTION_STATUSES = { active: 'active', disconnected: 'disconnected', revoked: 'revoked' } as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[keyof typeof CONNECTION_STATUSES];

export const CALENDAR_PURPOSE: string = 'calendar-refresh-token';

export const SCOPE_READ_WRITE: string = 'https://www.googleapis.com/auth/calendar.events';
export const READ_ONLY_SCOPES: readonly string[] = [
    'https://www.googleapis.com/auth/calendar.events.readonly',
    'https://www.googleapis.com/auth/calendar.readonly'
];
export const WRITE_SCOPES: readonly string[] = [SCOPE_READ_WRITE, 'https://www.googleapis.com/auth/calendar'];

export type CalendarAccess = 'read_write' | 'read_only';

export const STATE_TTL_MS: number = 10 * 60_000;
export const UPCOMING_DAYS: number = 7;
export const UPCOMING_MAX: number = 10;
export const DEFAULT_DURATION_MINUTES: number = 60;
export const MAX_DURATION_MINUTES: number = 24 * 60;
export const MAX_TITLE_CHARS: number = 200;

export const VERA_SOURCE: string = 'vera';

export interface ClientCredentials {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly redirectUri: string;
}

export interface CalendarSession {
    readonly refreshToken: string;
    readonly scopes: readonly string[];
    readonly credentials: ClientCredentials;
}

export interface CalendarEvent {
    readonly id: string;
    readonly title: string;
    readonly start: string;
    readonly end: string;
    readonly allDay: boolean;
    readonly byVera: boolean;
}

export interface CalendarRange {
    readonly from: Date;
    readonly to: Date;
    readonly max: number;
}

export interface NewCalendarEvent {
    readonly summary: string;
    readonly start: Date;
    readonly end: Date;
    readonly timeZone: string;
    readonly source: typeof VERA_SOURCE;
    readonly idempotencyKey: string;
}

export interface CreatedCalendarEvent {
    readonly eventId: string;
    readonly duplicate: boolean;
}

export interface CodeExchange {
    readonly credentials: ClientCredentials;
    readonly code: string;
    readonly codeVerifier: string;
}

export interface CalendarGrant {
    readonly refreshToken: string | null;
    readonly scopes: readonly string[];
    readonly email: string | null;
}

export interface ConnectionView {
    readonly status: 'none' | 'active' | 'revoked';
    readonly email: string | null;
    readonly connectedAt: string | null;
    readonly access: CalendarAccess | null;
}

export const CALLBACK_ERRORS = {
    consentDenied: 'calendar.consent_denied',
    scopeMissing: 'calendar.scope_missing',
    stateInvalid: 'calendar.state_invalid',
    providerUnavailable: 'calendar.provider_unavailable'
} as const;
export type CallbackError = (typeof CALLBACK_ERRORS)[keyof typeof CALLBACK_ERRORS];
