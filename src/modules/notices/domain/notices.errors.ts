import { AppError } from '../../../shared/errors/app.error';

export class UnknownNoticeTypeError extends AppError {
    public constructor(type: string) {
        super({ code: 'notices.unknown_type', status: 422, detail: 'The notice type is not registered.', meta: { type } });
    }
}

export class InvalidUnsubscribeTokenError extends AppError {
    public constructor() {
        super({ code: 'notices.invalid_token', status: 404, detail: 'The unsubscribe link is not valid.' });
    }
}
