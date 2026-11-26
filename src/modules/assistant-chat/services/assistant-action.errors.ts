import { AppError } from '../../../shared/errors/app.error';

export class ConfirmationStaleError extends AppError {
    public constructor() {
        super({ code: 'assistant.confirmation_stale', status: 409, detail: 'What the action refers to changed since it was proposed.' });
    }
}

export class ActionChoiceInvalidError extends AppError {
    public constructor(reason: string) {
        super({
            code: 'assistant.action_choice_invalid',
            status: 400,
            detail: 'The choice sent with the confirmation is missing or invalid.',
            meta: { reason }
        });
    }
}
