import { AppError } from '../../../shared/errors/app.error';

export class WhatsAppProviderDisabledError extends AppError {
    public constructor() {
        super({
            code: 'whatsapp.provider_disabled',
            status: 503,
            detail: 'WhatsApp is not configured for this account.'
        });
    }
}

export class WhatsAppWindowClosedError extends AppError {
    public constructor() {
        super({
            code: 'whatsapp.window_closed',
            status: 409,
            detail: 'The 24-hour customer service window is closed; only an approved template can be sent.'
        });
    }
}

export class WhatsAppTemplateUnavailableError extends AppError {
    public constructor(template: string) {
        super({
            code: 'whatsapp.template_unavailable',
            status: 503,
            detail: 'The template is not approved for this number.',
            meta: { template }
        });
    }
}

export class WhatsAppSendFailedError extends AppError {
    public constructor(errorCode: string) {
        super({
            code: 'whatsapp.send_failed',
            status: 502,
            detail: 'WhatsApp refused or could not deliver the message.',
            meta: { errorCode }
        });
    }
}

export class WhatsAppMisconfiguredError extends Error {
    public constructor(reason: string) {
        super(`whatsapp_misconfigured:${reason}`);
        this.name = 'WhatsAppMisconfiguredError';
    }
}

export class WebhookBodyTooLargeError extends AppError {
    public constructor() {
        super({
            code: 'whatsapp.webhook_body_too_large',
            status: 413,
            detail: 'The webhook body exceeds the accepted size.'
        });
    }
}

export class WebhookContentTypeError extends AppError {
    public constructor() {
        super({
            code: 'whatsapp.webhook_content_type',
            status: 415,
            detail: 'The webhook body must be application/json.'
        });
    }
}

export class WebhookVerificationFailedError extends AppError {
    public constructor() {
        super({
            code: 'whatsapp.webhook_verification_failed',
            status: 403,
            detail: 'The webhook verification handshake was refused.'
        });
    }
}

export class WhatsAppDevRouteDisabledError extends AppError {
    public constructor() {
        super({
            code: 'whatsapp.dev_route_disabled',
            status: 404,
            detail: 'Development routes are only available locally with the mock driver.'
        });
    }
}
