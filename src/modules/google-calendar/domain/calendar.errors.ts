import { AppError } from '../../../shared/errors/app.error';
import { CallbackError } from './calendar.types';

export class CalendarProviderDisabledError extends AppError {
    public constructor() {
        super({ code: 'calendar.provider_disabled', status: 503, detail: 'Google Calendar is not configured in this installation.' });
    }
}

export class CalendarNotConnectedError extends AppError {
    public constructor() {
        super({ code: 'calendar.not_connected', status: 409, detail: 'The person has no active Google Calendar connection.' });
    }
}

export class CalendarProviderUnavailableError extends AppError {
    public constructor(cause?: unknown) {
        super({ code: 'calendar.provider_unavailable', status: 503, detail: 'Google Calendar did not answer in time.', cause });
    }
}

export class CalendarReadOnlyError extends AppError {
    public constructor() {
        super({ code: 'calendar.read_only', status: 409, detail: 'The connection can list events but cannot create them.' });
    }
}

export class CalendarTokenRevokedError extends AppError {
    public constructor() {
        super({ code: 'calendar.token_revoked', status: 409, detail: 'Google no longer accepts the stored permission.' });
    }
}

export class CalendarCallbackError extends AppError {
    public constructor(public readonly reason: CallbackError) {
        super({ code: reason, status: 400, detail: 'The Google authorization could not be completed.' });
    }
}
