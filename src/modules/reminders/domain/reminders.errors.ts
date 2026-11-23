import { AppError } from '../../../shared/errors/app.error';

export class ReminderNotFoundError extends AppError {
    public constructor() {
        super({ code: 'reminders.not_found', status: 404, detail: 'The reminder does not exist for this person.' });
    }
}

export class ReminderLimitReachedError extends AppError {
    public constructor(limit: number) {
        super({
            code: 'reminders.limit_reached',
            status: 409,
            detail: 'The person already has the maximum number of active reminders.',
            meta: { limit }
        });
    }
}

export class ReminderInvalidScheduleError extends AppError {
    public constructor(reason: string) {
        super({
            code: 'reminders.invalid_schedule',
            status: 422,
            detail: 'The reminder date or time is not valid or is already in the past.',
            meta: { reason }
        });
    }
}
