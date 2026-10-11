import { AppError } from '../../shared/errors/app.error';

export class MailDeliveryError extends AppError {
    public constructor(cause: unknown) {
        super({
            code: 'mail.delivery_failed',
            status: 502,
            detail: 'The mail provider rejected or failed to accept the message.',
            cause
        });
    }
}

export class UnknownMailTemplateError extends AppError {
    public constructor(template: string) {
        super({
            code: 'mail.unknown_template',
            status: 500,
            detail: `No renderer registered for mail template "${template}".`,
            meta: { template }
        });
    }
}
