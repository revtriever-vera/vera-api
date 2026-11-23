import { AppError } from '../../../shared/errors/app.error';

export class WhatsAppAlreadyLinkedError extends AppError {
    public constructor() {
        super({
            code: 'whatsapp.already_linked',
            status: 409,
            detail: 'This person already has a linked WhatsApp number; unlink it before generating a new code.'
        });
    }
}

export class WhatsAppConsentRequiredError extends AppError {
    public constructor() {
        super({
            code: 'whatsapp.consent_required',
            status: 422,
            detail: 'The account has not allowed sending aggregated figures to a language model; send consent: true to accept.'
        });
    }
}
